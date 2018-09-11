import colors from 'colors'
import dot from 'dot'
import {getLoader} from '../lib/CradleUtils'
import LoaderOptions from '../lib/LoaderOptions'

export default async function verifyLoaderSource(loaderOptions: LoaderOptions) {
  getLoader(loaderOptions).then(async (loader) => {
    const schema = await loader.loadSchema()
    const modelNames = Object.keys(schema)
    console.log(colors.yellow(JSON.stringify(schema, null, 2)))
    console.log(colors.green(`Schema verified`))
  }).catch((err: Error) => {
    console.log(colors.red(err.message))
  })
}

// const dataObject = {
//   test: 3,
//   toDataType() {
//     return `Hey ${this.test}, ${this.test}`
//   }
// }

// const temp = dot.template('{{=it.toDataType()}}')
// const resultText = temp(dataObject)
// console.log(resultText)
