.PHONY: help
.DEFAULT_GOAL := help

# Define the defaults
PORT ?= 8000
EDITOR ?= micro
PYTHON ?= python3

chat_ollama: ## Command to start the server
	@echo "Starting Server For Chat Ollama UI: http://localhost:$(PORT)/index.html"
	@$(PYTHON) -m webbrowser -t "http://localhost:$(PORT)/index.html"
	@$(PYTHON) -m http.server $(PORT)

edit: ## Edit this Makefile
	@$(EDITOR) Makefile

help: ## Show this help message
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}'
