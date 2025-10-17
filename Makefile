.PHONY: setup backend frontend seed run-backend

VENV?=.venv
PYTHON?=python3

setup:
$(PYTHON) -m venv $(VENV)
$(VENV)/bin/python -m pip install --upgrade pip
@echo "Environment ready. Use 'make run-backend' to start the API."

run-backend:
cd backend && PYTHONPATH=. $(VENV)/bin/python -m app.server

seed:
cd backend && PYTHONPATH=. $(VENV)/bin/python seed.py
