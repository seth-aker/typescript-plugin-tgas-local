# Typescript-plugin-tgas-local
A typescript language server plugin to improve the experience for developing Google Apps Scripts (GAS) locally with typescript. This plugin hooks into the typescript languageServiceHost and injects a virtual type declaration file based on the source directory of your GAS files.

## Installation
1. Install the plugin and dependancies: `pnpm install -D typescript-plugin-tgas-local @types/google-apps-script typescript`

2. Add the following fields to your tsconfig.json
```json
{
  // ...rest of your compilerOptions
  "plugins": [
    {
      "name": "typescript-plugin-tgas-local",
      "apps-script-directory": "./RELATIVE_PATH_TO_YOUR_GAS_FILES"
    }
  ]
}
```

## How it works
Essentially, the plugin searches your files for the `gasRequire()` function from tgas-local package. Once it finds that, it generates a type file (.d.ts) based on the top level declarations inside of your GAS files. It then applies those types as the return object of `gasRequire()`

## Links
[tgas-local]("https://github.com/seth-aker/tgas-local"): Run and test GAS code locally with typescript.

