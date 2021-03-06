import fs from 'fs'
import yaml from 'js-yaml'
import path from 'path'
import { CradleLoaderBase } from '../CradleLoaderBase'
import CradleSchema from '../CradleSchema'
import { IConsole } from '../IConsole'
import ICradleLoader from '../ICradleLoader'
import LoaderOptions from '../LoaderOptions'
import ModelReference, { RelationTypes } from '../ModelReference'
import ArrayPropertyType from '../PropertyTypes/ArrayPropertyType'
import BooleanPropertyType from '../PropertyTypes/BooleanPropertyType'
import constants from '../PropertyTypes/constants'
import DateTimePropertyType from '../PropertyTypes/DateTimePropertyType'
import DecimalPropertyType from '../PropertyTypes/DecimalPropertyType'
import IntegerPropertyType from '../PropertyTypes/IntegerPropertyType'
import ModelReferenceType from '../PropertyTypes/ModelReferenceType'
import ObjectPropertyType from '../PropertyTypes/ObjectPropertyType'
import PropertyType from '../PropertyTypes/PropertyType'
import StringPropertyType from '../PropertyTypes/StringPropertyType'
import UniqueIdentifierPropertyType from '../PropertyTypes/UniqueIdentifierPropertyType'
import SpecProperty from './SpecProperty'
import ParseProperty from './SpecPropertyTypeParser'

export default class SpecLoader extends CradleLoaderBase {

  private console?: IConsole
  private specObject?: object

  private function
  public readModelPropertyType(modelName: string, propertyName: string): Promise<PropertyType> {
    return new Promise((resolve, reject) => {
      try {
        return resolve(this.readPropertyDefinition(modelName, [propertyName]))
      } catch (err) {
        throw new Error(`Error: '${err.message}' encountered while parsing ${modelName}.${propertyName}`)
      }

    })
  }

  public readModelNames(): Promise<string[]> {
    if (this.specObject) {
      const modelNames = Object.keys(this.specObject)
      return Promise.resolve(modelNames)
    } else {
      throw new Error('No spec file loaded')
    }

  }

  public readModelPropertyNames(modelName: string): Promise<string[]> {
    if (!this.specObject) {
      throw new Error(`No spec file loaded`)
    }
    if (!this.specObject[modelName]) {
      throw new Error(`The spec file does not contain a model named '${modelName}'`)
    }
    if (typeof this.specObject[modelName] === typeof ('')) {
      throw new Error(`The model definition must be an object`)
    } else {
      if (!this.specObject[modelName].properties) {
        throw new Error(`Model '${modelName}' does not define any properties`)
      } else {
        return Promise.resolve(Object.keys(this.specObject[modelName].properties))
      }
    }
  }

  public readModelReferenceNames(modelName: string): Promise<string[]> {
    return new Promise((resolve, reject) => {
      if (!this.specObject) {
        throw new Error('No spec file loaded')
      }
      if (!this.specObject[modelName]) {
        throw new Error(`The spec file does not contain a model named '${modelName}'`)
      }
      if (!this.specObject[modelName].references) {
        return resolve([])
      } else {
        return resolve(Object.keys(this.specObject[modelName].references))
      }
    })

  }
  public readModelReferenceType(modelName: string, referenceName: string): Promise<ModelReference> {
    return new Promise((resolve, reject) => {

      const reference = this.specObject![modelName].references[referenceName]

      const SINGLE_REGEX = /single\?? of (\w+)/ig
      const MULTIPLE_REGEX = /multiple\?? of (\w+)/ig
      const SINGLE_ON_REGEX = /single of (\w+) on (\w+)/ig
      const MULTIPLE_VIA_REGEX = /multiple of (\w+) via (\w+)/ig

      if (reference.match(SINGLE_ON_REGEX)) {
        const matches = SINGLE_ON_REGEX.exec(reference)
        if (matches && matches.length === 3) {
          const remoteModelName = matches[1]
          const localPropertyName = matches[2]
          resolve(new ModelReference(localPropertyName, remoteModelName, RelationTypes.SingleOn, false))
        } else {
          throw new Error(`Invalid single on reference pattern: ${reference}`)
        }
      } else if (reference.match(MULTIPLE_VIA_REGEX)) {
        const matches = MULTIPLE_VIA_REGEX.exec(reference)
        if (matches && matches.length === 3) {
          const remoteModelName = matches[1]
          const proxyTableName = matches[2]
          resolve(new ModelReference('', remoteModelName, RelationTypes.MultipleVia, false, proxyTableName))
        } else {
          throw new Error(`Invalid multiple via reference pattern: ${reference}`)
        }
      } else if (reference.match(SINGLE_REGEX)) {
        const matches = SINGLE_REGEX.exec(reference)
        if (matches && matches.length === 2) {
          const remoteModelName = matches[1]
          resolve(new ModelReference('', remoteModelName, RelationTypes.Single, matches[0].indexOf('?') > -1))
        } else {
          throw new Error(`Invalid single reference pattern: ${reference}`)
        }
      } else if (reference.match(MULTIPLE_REGEX)) {
        const matches = MULTIPLE_REGEX.exec(reference)
        if (matches && matches.length === 2) {
          const remoteModelName = matches[1]
          resolve(new ModelReference('', remoteModelName, RelationTypes.Multiple, matches[0].indexOf('?') > -1))
        } else {
          throw new Error(`Invalid multiple reference pattern: ${reference}`)
        }
      } else {
        throw new Error(`Reference must follow pattern of either 'single of MODEL NAME on LOCAL PROPERTY NAME' or 'multiple of MODEL NAME via PROXY TABLE NAME' or 'single of MODEL NAME' or 'multiple of MODEL NAME', received '${reference.toUpperCase()}'`)
      }
    })

  }

  public async prepareLoader(options: { [key: string]: any }, console: IConsole): Promise<void> {

    this.console = console

    if (!fs.existsSync(options.source)) {
      throw new Error(`Source file does not exist: ${options.source}`)
    } else {
      const dir = path.dirname(path.resolve(options.source))
      this.specObject = yaml.safeLoad(fs.readFileSync(options.source, 'utf8'))

      // Handle split spec files
      // This will only allow spec file references from the master file
      // meaning you can't chain together references.  This also helps prevent
      // circular references
      const modelNames = await this.readModelNames()
      modelNames.map((mn) => {
        if (this.specObject && typeof (this.specObject[mn]) === typeof ('')) {
          const fileParts = this.specObject[mn].split('#')
          const filePath = path.join(dir, fileParts[0])
          const modelName = fileParts[1]

          const tempReq = yaml.safeLoad(fs.readFileSync(filePath, 'utf8'))
          this.specObject[mn] = tempReq[modelName]
        }

      })

    }

    return Promise.resolve()
  }

  public readModelMetadata(modelName: string): Promise<object> {
    return new Promise((resolve, reject) => {
      return resolve(this.specObject![modelName].meta)
    })

  }

  public finalizeSchema(schema: CradleSchema): Promise<CradleSchema> {

    const modelNames = Object.keys(schema.Models)
    modelNames.map((k) => {

      const model = schema.Models[k]

      const propertyNames = Object.keys(model.Properties)
      propertyNames.map((pn) => {
        const prop = model.Properties[pn]

        if (prop.TypeName === constants.ModelReference && prop.ModelName) {
            schema.Models[k].Properties[pn].ModelType = this.getModelReference(schema, prop)
        }
        if (prop.TypeName === constants.Array && prop.MemberType && prop.MemberType.TypeName === constants.ModelReference && prop.MemberType.ModelName) {
            schema.Models[k].Properties[pn].MemberType.ModelType = this.getModelReference(schema, prop.MemberType)
        }
      })

    })
    return Promise.resolve(schema)
  }
  public getModelReference(schema: CradleSchema, ref: ModelReferenceType): ObjectPropertyType {

    const modelRef = schema.Models.find((m) => m.Name === ref.ModelName)
    if (modelRef) {
      return new ObjectPropertyType(this.propertiesToArray(modelRef.Properties))
    } else {
      throw new Error(`Invalid model reference: ${ref.ModelName}`)
    }
  }

  private propertiesToArray(propertyObject: object): Array<{ propertyName: string, propertyType: PropertyType }> {
    const propNames = Object.keys(propertyObject)
    return propNames.map((pn) => ({ propertyName: pn, propertyType: propertyObject[pn] }))
  }

  private readPropertyDefinition(modelName: string, propertyPath: string[]): PropertyType {
    if (this.specObject) {
      const model = this.specObject[modelName]

      let currentProperty = model.properties[propertyPath[0]]
      for (let i = 1; i < propertyPath.length; i++) {

        if (currentProperty.properties && currentProperty.properties[propertyPath[i]]) {
          currentProperty = currentProperty.properties[propertyPath[i]]
        }
      }

      const property = currentProperty

      if (typeof (property) === 'string') {

        const specProperty = ParseProperty(property)
        if (specProperty) {

          const propertyType = this.createPropertyTypeFromSpecResult(specProperty)
          if (specProperty.IsArray) {
            return new ArrayPropertyType(propertyType)
          } else {
            return propertyType
          }
        } else {
          throw new Error(`Unable to parse property ${propertyPath.join('.')}`)
        }

      } else {
        const isArray = property.isArray
        if (property.modelRef) {
          if (isArray) {
            return new ArrayPropertyType(new ModelReferenceType(property.modelRef))
          } else {
            return new ModelReferenceType(property.modelRef)
          }
        }
        const subProperties = Object.keys(property.properties)

        const members: Array<{ propertyName: string, propertyType: PropertyType }> = []
        for (const subProp of subProperties) {
          if (!!subProp) {
            const subPath = propertyPath.concat([subProp])
            members.push({ propertyName: subProp, propertyType: this.readPropertyDefinition(modelName, subPath) })
          }
        }
        const propertyType = new ObjectPropertyType(members, true, false, null)
        if (isArray) {
          return new ArrayPropertyType(propertyType)
        } else {
          return propertyType
        }
      }
    } else {
      throw new Error(`No spec file loaded`)
    }
  }

  private createPropertyTypeFromSpecResult(spec: SpecProperty): PropertyType {
    switch (spec.PropertyType.toLocaleUpperCase()) {
      case constants.Boolean.toLocaleUpperCase(): return new BooleanPropertyType(spec.Nullable, spec.PrimaryKey, spec.DefaultValue, spec.Unique)
      case constants.DateTime.toLocaleUpperCase(): return new DateTimePropertyType(spec.Nullable, spec.PrimaryKey, spec.DefaultValue, spec.MaxValue, spec.MinValue, spec.Unique)
      case constants.Decimal.toLocaleUpperCase(): return new DecimalPropertyType(undefined, undefined, spec.MinValue, spec.MaxValue, spec.Nullable, spec.PrimaryKey, spec.DefaultValue, spec.Unique)
      case constants.Integer.toLocaleUpperCase(): return new IntegerPropertyType(spec.MinValue, spec.MaxValue, spec.AutogenerateOptions, spec.Nullable, spec.PrimaryKey, spec.DefaultValue, spec.Unique)
      case constants.String.toLocaleUpperCase(): return new StringPropertyType(spec.Length, spec.AllowedValues, true, spec.Nullable, spec.PrimaryKey, spec.DefaultValue, spec.Unique)
      case constants.UniqueIdentifier.toLocaleUpperCase(): return new UniqueIdentifierPropertyType(spec.Nullable, spec.PrimaryKey, spec.AutogenerateOptions, spec.DefaultValue, spec.Unique)
      default: {
        throw new Error(`Unexpected property type: ${spec.PropertyType}`)
      }
    }
  }
}
