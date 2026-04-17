import sys
try:
    import fastapi
    print("fastapi found")
except ImportError:
    print("fastapi not found")

try:
    import uvicorn
    print("uvicorn found")
except ImportError:
    print("uvicorn not found")

with open("py_check.txt", "w") as f:
    f.write(f"Python version: {sys.version}\n")
    try:
        import fastapi
        f.write("fastapi: installed\n")
    except:
        f.write("fastapi: MISSING\n")
