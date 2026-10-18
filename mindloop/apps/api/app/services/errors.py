class DomainError(Exception):
    status_code = 400
    code = "bad_request"

    def __init__(self, message: str = "", code: str | None = None) -> None:
        super().__init__(message or self.code)
        if code:
            self.code = code


class NotFound(DomainError):
    status_code = 404
    code = "not_found"


class Conflict(DomainError):
    status_code = 409
    code = "conflict"


class Unauthorized(DomainError):
    status_code = 401
    code = "unauthorized"


class Forbidden(DomainError):
    status_code = 403
    code = "forbidden"


class InvalidInput(DomainError):
    status_code = 422
    code = "invalid_input"


class PayloadTooLarge(DomainError):
    status_code = 413
    code = "payload_too_large"
