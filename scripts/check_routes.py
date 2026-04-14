from src.main import app

for route in app.routes:
    if hasattr(route, "path"):
        print(f"Path: {route.path}, Name: {route.name}, Methods: {route.methods}")
