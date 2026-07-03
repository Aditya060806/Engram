import os
import sys

# Make the backend package modules importable (metrics, graph_model, ...)
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
