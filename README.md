<p align="center"><a href="https://shashwat-r.github.io/OllamaChatPlayground/" target="_blank"><img src="/favicon.png" height="128" width="128" alt="Open Preview"/></a></p>

# Ollama Chat Playground

Simple Local Chat Interface For Ollama

### Preview
<i>* Subject to change with new UI updates.</i>
<br>
<br>
<img src="/previews/preview-01.png">

### Setup and Usage
- Clone or Download the files in this repo.
- Start your Ollama Server. You could use a remotely hosted Ollama instance, and have it's url handy, or, use the default Ollama Server that runs locally on
  - ```
    http://localhost:11434
    ```
- Here's the command to launch a local server for the Chat UI
  - ```
    make ollama_chat_playground
    ```
  - Now, the Chat UI is ready to be used. It will be hosted at
  - ```
    localhost:8000/index.html
    ```
  - Ideally, opening the `index.html` file locally in your browser should have been sufficient to use this Chat UI, however, the browser enforces CORS related security checks to prevent `file://` urls from interacting with the Ollama Service. Thus, you need to run the above command to start a local server.
  - This doesn't have any dependencies except for `python` and `make` commands which usually ship with linux and mac systems. In case that's not true, you will need to install them.
  - In the Chat UI, you'll need to select an Ollama Model, available through a dropdown, and you're ready to chat 👍
- [Optional] You could explore these use cases as well if needed.
  - In case you need to change the port at which the Chat UI runs, you could tweak the Makefile. You could open it in your favorite editor or run the following command
  - ```
    make edit
    ```
  - And to get a list of commands, you could simply run
  - ```
    make help
    ```
