# Entry point for Render: loads the real app from the backend folder.
import importlib.util
import os
import sys

BACKEND = os.path.join(os.path.dirname(os.path.abspath(__file__)), "backend")
sys.path.insert(0, BACKEND)

spec = importlib.util.spec_from_file_location("backend_main", os.path.join(BACKEND, "main.py"))
backend_main = importlib.util.module_from_spec(spec)
spec.loader.exec_module(backend_main)

app = backend_main.app
