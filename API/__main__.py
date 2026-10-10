"""Run the catalog API on 127.0.0.1:8001."""

from pathlib import Path

import uvicorn

from API.app import create_app
from API.env import load_env


def main() -> None:
    load_env(Path(__file__).resolve().parent.parent / ".env")
    uvicorn.run(create_app(), host="127.0.0.1", port=8001)


if __name__ == "__main__":
    main()
