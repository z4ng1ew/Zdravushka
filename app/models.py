from pydantic import BaseModel, Field


class ChatRequest(BaseModel):
    session_id: str | None = None
    text: str = ""


class Booking(BaseModel):
    visit_id: int | None = None
    doctor_id: int | None = None
    doctor_name: str | None = None
    specialty: str | None = None
    scheduled_at: str | None = None
    spoken: str | None = None
    status: str | None = None


class Escalation(BaseModel):
    rule: str
    reason: str
    priority: str
    emergency: bool = False
    summary: str


class ChatResponse(BaseModel):
    session_id: str
    reply: str
    intent: str | None = None
    collected: dict = Field(default_factory=dict)
    options: list[Booking] = Field(default_factory=list)
    booking: Booking | None = None
    escalation: Escalation | None = None
    done: bool = False
    status: str = "in_progress"
    source: str | None = None
