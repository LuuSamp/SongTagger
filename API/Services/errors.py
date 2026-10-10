"""HTTP-facing errors raised by services. No FastAPI import."""


class APIError(Exception):
    def __init__(self, status_code: int, detail: str) -> None:
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail


class BadRequest(APIError):
    def __init__(self, detail: str) -> None:
        super().__init__(400, detail)


class NotFound(APIError):
    def __init__(self, detail: str) -> None:
        super().__init__(404, detail)


class UpstreamError(APIError):
    def __init__(self, detail: str) -> None:
        super().__init__(502, detail)
