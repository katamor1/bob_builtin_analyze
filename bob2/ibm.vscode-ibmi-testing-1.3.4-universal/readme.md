# IBM i Testing

<img src="https://github.com/IBM/vscode-ibmi-testing/raw/HEAD/icon.png" align="right" width="256" height="256">

[![Version](https://img.shields.io/visual-studio-marketplace/v/IBM.vscode-ibmi-testing)](https://marketplace.visualstudio.com/items?itemName=IBM.vscode-ibmi-testing)
[![Installs](https://img.shields.io/visual-studio-marketplace/i/IBM.vscode-ibmi-testing)](https://marketplace.visualstudio.com/items?itemName=IBM.vscode-ibmi-testing)

The [IBM i Testing](https://marketplace.visualstudio.com/items?itemName=IBM.vscode-ibmi-testing) VS Code extension empowers developers to run unit tests and generate code coverage results for RPG and COBOL programs on IBM i with ease. Under the covers, this extension leverages the [RPGUnit](https://irpgunit.sourceforge.io/help) testing framework. It not only simplifies compiling and running tests but also accelerates test creation with built-in stub generation, making it easy to get started. For automation, the companion [IBM i Testing CLI](https://www.npmjs.com/package/@ibm/itest) lets you run tests in your terminal on your local PC or in PASE on IBM i, enabling you to script the execution of tests in a CI/CD pipeline.

* 👨‍💻 **Run Tests**: Visualize and run tests suites out of local files or source members.
* ✍️ **Generate Stubs**: Generate test stubs for individual test cases or an entire test suite.
* ⚙️ **Configure Tests**: Configure parameters to compile (`RUCRTRPG`/`RUCRTCBL`) and run (`RUCALLTST`) tests.
* 📋 **View Test Results**: View detailed test results with inline failure/error messages.
* 🎯 **Generate Code Coverage**: View line and procedure level code coverage as an overlay in the editor.
* 🤖 **Automate Tests**: Script test execution locally or in PASE, enabling automated testing in CI/CD pipelines.

✨ Check out the full documentation [here](https://codefori.github.io/docs/developing/testing/overview)!