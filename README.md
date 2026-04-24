# Ollama Chat Playground

<p align="center">
  <a href="https://shashwat-r.github.io/OllamaChatPlayground/">
    <img src="/favicon.png" height="128" width="128" alt="Open Preview" title="Click to open Ollama Chat Playground"/>
  </a><br>
  <a href="https://shashwat-r.github.io/OllamaChatPlayground/">
    Click the icon to launch Ollama Chat Playground
  </a>
</p>

## Introduction

A simple local chat interface for Ollama.

Specify the host and select an Ollama model (available via a dropdown in the playground), and you're ready to chat 👍

<img src="/previews/preview-01.png">
<sup>*Preview image may change with future UI updates.</sup>

## Setup and Usage

### Assumptions

* These instructions assume a Linux or macOS-based system where `python3` and `make` are usually available. If not, install them using standard methods. The setup is minimal and can be adapted for Windows if needed.
* This app requires access to a running Ollama server (local or remote). A field is provided in the UI to specify the host.

## Methods to Run the Playground

### Method 1: (Easiest) Local Ollama Server + Hosted Playground (GitHub Pages)

* This is the simplest setup—no downloads required. You only need a local Ollama server.
* Run your local Ollama server with CORS enabled:

```bash
OLLAMA_HOST=0.0.0.0:11434 OLLAMA_ORIGINS=https://shashwat-r.github.io ollama serve
```

* Open the playground: [https://shashwat-r.github.io/OllamaChatPlayground](https://shashwat-r.github.io/OllamaChatPlayground)
* Done 👍

### Method 2: Remote Ollama Server + Hosted Playground

* Instead of running Ollama locally, you can host it remotely (e.g., via Google Colab + ngrok).
* Regardless of where it's hosted, run:

```bash
OLLAMA_HOST=0.0.0.0:11434 OLLAMA_ORIGINS=https://shashwat-r.github.io ollama serve
```

* Then access the playground: [https://shashwat-r.github.io/OllamaChatPlayground](https://shashwat-r.github.io/OllamaChatPlayground)
* Done 👍

### Method 3: (Standard) Local Ollama Server + Local Playground

* Clone or download this repository.
* Start Ollama:

```bash
make ollama_serve
```

This wraps:

```bash
OLLAMA_HOST=0.0.0.0:11434 OLLAMA_ORIGINS=https://shashwat-r.github.io ollama serve
```

* Your Ollama server will run at:

```text
http://localhost:11434
```

* Start the playground:

```bash
make ollama_chat_playground
```

* Open: http://localhost:8000
* Done 👍

### Method 4: Remote Ollama Server + Local Playground

* Download the repo.
* Start the playground:

```bash
make ollama_chat_playground
```

* Open: http://localhost:8000

* Enter your remote Ollama server URL in the UI.
* Done 👍

### Method 5: Local Ollama Server + Remote Playground

* Similar to Method 1, but with a custom or different hosted UI.
* Find your playground origin in the browser console:

```js
window.location.origin
```

* Run:

```bash
OLLAMA_HOST=0.0.0.0:11434 OLLAMA_ORIGINS=<ollama_chat_playground_origin> ollama serve
```
* Open your remote playground.
* Done 👍

### Method 6: Remote Ollama Server + Remote Playground

* Similar to Method 2, but fully remote.
* Get the playground origin:

```js
window.location.origin
```

* Run on the server:

```bash
OLLAMA_HOST=0.0.0.0:11434 OLLAMA_ORIGINS=<ollama_chat_playground_origin> ollama serve
```
* Open your remote playground.
* Done 👍

## Additional Notes

* Opening `index.html` directly (`file://`) will **not work** due to browser CORS restrictions. You must serve it via a local server.
* To change the playground port, edit the `Makefile`:

```bash
make edit
```

* To see available commands:

```bash
make help
```

or simply:

```bash
make
```

## Conclusion

This is a hobby project and is not intended to compete with the
[Official Ollama Chatbot](https://docs.ollama.com/integrations/onyx).

It’s a lightweight playground for exploring how LLM chat systems work under the hood.

The UI is functional but still evolving. A great way I learn more is by opening Developer Tools and inspecting network calls, streaming behavior, and rendering.

Hope you enjoy experimenting with it 👍
