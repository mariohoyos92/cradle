const program = require('commander')

import colors from 'colors'
import ICradleLoader from '../lib/ICradleLoader'
import LoaderOptions from '../lib/LoaderOptions'
import SpecLoader from '../lib/SpecLoader/SpecLoader'
program
  .option('-s, --source [definition]', 'source definition')
  .option('-l, --loader [loader name]', 'source loader')

  .parse(process.argv)

async function getLoader(): Promise<ICradleLoader> {
  let loader!: ICradleLoader
  if (program.loader.toLowerCase() === 'spec') {
    // use cradle spec loader
      loader = new SpecLoader()

  } else {
    // TO-DO: handle other loaders here
      try {
        const loaderDef = require(program.loader)
        try {
        loader = new loaderDef()
        } catch (err) {
          return Promise.reject(`${program.loader} module was found but a valid ICradleLoader is not the default export`)
        }
      } catch (err) {
        return Promise.reject(err)
      }
  }
  await loader.prepareLoader(new LoaderOptions(program.source, console))
  return loader
}

getLoader().then(async (loader) => {
  const modelNames = await loader.readModelNames()
  console.log('Model names are ', modelNames)
}).catch((err) => {
  console.log(colors.red(err))
})