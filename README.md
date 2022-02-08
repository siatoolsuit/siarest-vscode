# Software Interface Analyser Toolsuit
Visual Studio Code Extension for analyzing API Endpoints created by [Express](https://github.com/expressjs/express).

If you search for a project that is ready for testing out this extension use this [Express & Angular App](https://github.com/Deezmax/BusinessTrip).

## Requirements
Visual Studio Code 1.22.0 or higher is required

## Installation
This is a Visual Studio Code extension written in Typescript.

To install this extension, you need to download this [Extension File](rest-verification-0.1.0-alpha.vsix) laying the root of this repository.

After the download, open Visual Studio Code go to the Extension Tab on the left side and install the downloaded file via `Install from VSIX...`

![Install VSIX](https://i.imgur.com/F8uLHCw.png)

### Easy Method
Just Clone this Repo Local

Open the root directory with Visual Studio Code and right click on the extension file `rest-verification-0.2.0.vsix`.

Then hit `Install Extension VSIX` and it should install the extension.  

## Features
  * Typechecking for endpoints Request/Result types (Express)
  * Autocompletion for API URLs
  * Reference/Definition lookup for API URLs
  * Information about the usage

## Development Requirements
  * Node v.14 (or higher)
  * Visual Studio Code 1.22.0 or higher

## Debugging and Local Setup
This Extension needs a [Node.js](https://nodejs.org/en/) installation. (Only Test with [Node.js 14](https://nodejs.org/download/release/v14.19.0/))

Before installing [download and install Node.js](https://nodejs.org/en/download/). Node.js 14 is at least required.

Installation of all required packages is done using the
[`npm install` command](https://docs.npmjs.com/getting-started/installing-npm-packages-locally):

```bash
$ npm install
```

After installation you can open the root of this repository inside of Visual Studio Code and navigate to the Debug Tab.

In the Debug Tab select either Launch Client (for opening a second instance of Visual Studio Code with the extension)
or select client + server to be capable to debug this extension.

Then hit the play button.

![Debug](https://i.imgur.com/AEv8Pfx.png)

