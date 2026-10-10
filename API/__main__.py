"""Run the catalog API on 127.0.0.1:8001."""

import uvicorn

from API.app import create_app


def main() -> None:
    uvicorn.run(create_app(), host="127.0.0.1", port=8001)


if __name__ == "__main__":
    main()
