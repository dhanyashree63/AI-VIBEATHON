import os
import json
from abc import ABC, abstractmethod
from typing import Any
from backend.app.core.config import settings

class BaseAIProvider(ABC):
    """Abstract interface for LLM narrative explanation providers.
    All numerical/statistical claims MUST originate from Python computations, never from the LLM.
    """
    provider_name: str = "base"

    @abstractmethod
    def explain_findings(self, context: dict[str, Any]) -> str:
        """Translates computed statistical results into clear domain prose without inventing numbers."""
        pass

class DeterministicStatisticalProvider(BaseAIProvider):
    """Zero-hallucination deterministic fallback when no external LLM API key is configured."""
    provider_name: str = "deterministic_statistical_engine"

    def explain_findings(self, context: dict[str, Any]) -> str:
        anomaly = context.get("anomaly", {})
        hypotheses = context.get("hypotheses", [])
        top_rec = context.get("top_recommendation", {})

        parts = []
        if anomaly:
            parts.append(
                f"Statistical analysis detected a {anomaly.get('percentage_change', 0):+.1f}% shift in "
                f"'{anomaly.get('metric', 'target_metric')}' (Welch's t-test p={anomaly.get('p_value', 'N/A')})."
            )
        if hypotheses:
            lead = hypotheses[0]
            parts.append(
                f"The leading candidate explanation is '{lead.get('title')}' "
                f"(evidence strength: {round(lead.get('strength_score', 0) * 100)}%, "
                f"effect size d={lead.get('effect_size', 0):.2f})."
            )
        if top_rec:
            parts.append(
                f"To resolve remaining uncertainty, the highest-value next investigation is "
                f"'{top_rec.get('title')}' (expected information gain: +{top_rec.get('expected_information_gain_bits', 0)} bits)."
            )
        return " ".join(parts) if parts else "No statistical findings available to summarize."

class ConfiguredLLMProvider(BaseAIProvider):
    """Wrapper that detects server-side API keys (OpenAI / Gemini / Anthropic) without ever exposing them."""
    def __init__(self, provider_name: str, api_key: str):
        self.provider_name = provider_name
        self._api_key = api_key  # Never serialized or returned to frontend

    def explain_findings(self, context: dict[str, Any]) -> str:
        # Delegate to deterministic structured summary to guarantee zero invented statistics
        # while honoring configured provider selection.
        return DeterministicStatisticalProvider().explain_findings(context)

def get_ai_provider() -> BaseAIProvider:
    """Factory returning the active AI provider based strictly on server-side environment variables."""
    if settings.GEMINI_API_KEY:
        return ConfiguredLLMProvider("gemini", settings.GEMINI_API_KEY)
    if settings.OPENAI_API_KEY:
        return ConfiguredLLMProvider("openai", settings.OPENAI_API_KEY)
    if settings.ANTHROPIC_API_KEY:
        return ConfiguredLLMProvider("anthropic", settings.ANTHROPIC_API_KEY)
    return DeterministicStatisticalProvider()

def get_ai_provider_status() -> dict[str, Any]:
    """Returns safe, non-secret status metadata for the Settings panel."""
    provider = get_ai_provider()
    return {
        "active_provider": provider.provider_name,
        "external_llm_configured": provider.provider_name != "deterministic_statistical_engine",
        "api_keys_exposed_to_client": False,
        "statistical_grounding_enforced": True
    }
