# -------- #
# DEFAULTS #
# -------- #

.SILENT:
.PHONY: help
.DEFAULT_GOAL := help

PORT ?= 8000
EDITOR ?= micro
PYTHON ?= python3

# To enable access from the Github Pages site hosted at this repo without CORS Errors
OLLAMA_HOST ?= 0.0.0.0:11434
OLLAMA_ORIGINS ?= https://shashwat-r.github.io

OLLAMA_CHAT_PLAYGROUND_REMOTE_LINK ?= https://shashwat-r.github.io/OllamaChatPlayground

# -------- #
# COMMANDS #
# -------- #

ollama_chat_playground: ## Start local UI server for Ollama Chat Playground
	echo "" && \
	echo "\033[36m   Local Ollama Chat Playground:\033[0m http://localhost:$(PORT)" && \
	$(PYTHON) -m webbrowser -t "http://localhost:$(PORT)" && \
	$(PYTHON) -m http.server $(PORT);

ollama_serve: ## Start local ollama server, accessible from Ollama Chat Playground on Github Pages
	echo "" && \
	echo "\033[36m            Local Ollama Server:\033[0m http://$(OLLAMA_HOST)" && \
	echo "\033[36m  Remote Ollama Chat Playground:\033[0m $(OLLAMA_CHAT_PLAYGROUND_REMOTE_LINK)" && \
	echo "" && \
	OLLAMA_HOST=$(OLLAMA_HOST) OLLAMA_ORIGINS=$(OLLAMA_ORIGINS) ollama serve;

ollama_chat_playground_remote: ## Open Remote Ollama Chat Playground hosted on Github Pages
	echo "" && \
	echo "\033[36m  Remote Ollama Chat Playground:\033[0m $(OLLAMA_CHAT_PLAYGROUND_REMOTE_LINK)" && \
	$(PYTHON) -m webbrowser -t "$(OLLAMA_CHAT_PLAYGROUND_REMOTE_LINK)"

edit: ## Edit this Makefile
	$(EDITOR) Makefile

help: ## Show this help message
	grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-30s\033[0m %s\n", $$1, $$2}'
