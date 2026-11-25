
import json
import os
import re
from typing import Any, TypedDict

from dotenv import load_dotenv
from langchain_groq import ChatGroq
from langgraph.graph import StateGraph, START, END


# ============================================================
# CONFIGURATION
# ============================================================

load_dotenv()

GROQ_API_KEY = os.getenv("GROQ_API_KEY")
GROQ_MODEL = os.getenv("GROQ_MODEL", "openai/gpt-oss-120b")

if not GROQ_API_KEY:
    raise ValueError("GROQ_API_KEY is missing from backend .env")

llm = ChatGroq(
    model=GROQ_MODEL,
    api_key=GROQ_API_KEY,
    temperature=0,
)


# ============================================================
# GENERAL HELPERS
# ============================================================

def response_to_text(response: Any) -> str:
    content = getattr(response, "content", response)

    if isinstance(content, str):
        return content

    if isinstance(content, list):
        parts = []
        for item in content:
            if isinstance(item, str):
                parts.append(item)
            elif isinstance(item, dict) and item.get("text"):
                parts.append(str(item["text"]))
        return "\n".join(parts)

    return str(content)


def parse_ai_json(response: Any) -> dict:
    content = response_to_text(response).strip()

    content = re.sub(
        r"^```(?:json)?\s*",
        "",
        content,
        flags=re.IGNORECASE,
    )
    content = re.sub(r"\s*```$", "", content)

    try:
        parsed = json.loads(content)
    except json.JSONDecodeError:
        match = re.search(r"\{.*\}", content, flags=re.DOTALL)

        if not match:
            raise ValueError("AI response did not contain valid JSON.")

        try:
            parsed = json.loads(match.group(0))
        except json.JSONDecodeError as exc:
            raise ValueError("AI returned malformed JSON.") from exc

    if not isinstance(parsed, dict):
        raise ValueError("AI response must be a JSON object.")

    return parsed


def invoke_json(prompt: str) -> dict:
    for attempt in range(2):
        response = llm.invoke(prompt)

        try:
            return parse_ai_json(response)
        except ValueError:
            if attempt == 1:
                raise

            prompt += (
                "\n\nReturn ONLY one valid JSON object. "
                "Do not include Markdown or code fences."
            )

    raise ValueError("Unable to obtain valid JSON from AI.")


def normalize_text(value: Any) -> str:
    return re.sub(
        r"[^a-z0-9]+",
        " ",
        str(value).lower(),
    ).strip()


def dedupe_key(value: Any) -> str:
    return normalize_text(value)


def clean_string_list(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []

    result = []
    seen = set()

    for item in value:
        if not isinstance(item, (str, int, float)):
            continue

        text = str(item).strip()
        key = dedupe_key(text)

        if text and key and key not in seen:
            seen.add(key)
            result.append(text)

    return result


def clean_dict_list(value: Any) -> list[dict]:
    if not isinstance(value, list):
        return []

    return [
        item for item in value
        if isinstance(item, dict)
    ]


def flatten_source_data(data: Any) -> str:
    if isinstance(data, dict):
        return " ".join(
            flatten_source_data(value)
            for value in data.values()
        )

    if isinstance(data, list):
        return " ".join(
            flatten_source_data(item)
            for item in data
        )

    return "" if data is None else str(data)


# ============================================================
# OBSERVATION VS CONTRIBUTING FACTOR
# ============================================================

OBSERVATION_ONLY_PATTERNS = [
    r"\boperator\s+(?:noticed|observed|saw)\b",
    r"\bno\s+equipment\s+breakdown\b",
    r"\bbatch\s+was\s+(?:placed\s+on\s+)?hold\b",
    r"\bqa\s+was\s+informed\b",
    r"\bprocess\s+was\s+stopped\b",
    r"\btemperature\s+fluctuation\s+was\s+noticed\b",
]


def is_observation_only(value: Any) -> bool:
    normalized = normalize_text(value)

    return any(
        re.search(pattern, normalized)
        for pattern in OBSERVATION_ONLY_PATTERNS
    )


def is_placeholder_factor(value: Any) -> bool:
    normalized = normalize_text(value)

    placeholders = [
        "no material related factors reported",
        "no factors reported",
        "no contributing factors reported",
        "none reported",
        "not reported",
        "not identified",
        "no material factors identified",
        "no factors identified",
    ]

    return normalized in {
        normalize_text(item)
        for item in placeholders
    }


def clean_contributing_factors(value: Any) -> list[str]:
    return [
        item
        for item in clean_string_list(value)
        if not is_observation_only(item)
        and not is_placeholder_factor(item)
    ]


# ============================================================
# EVIDENCE DEDUPLICATION
# ============================================================

EVIDENCE_ALIASES = {
    "temperature monitoring records": [
        "temperature monitoring records",
        "temperature trend records",
        "data logger temperature records",
        "scada temperature records",
        "temperature logs",
    ],
    "sensor calibration records": [
        "calibration certificate",
        "calibration history",
        "sensor calibration records",
        "temperature sensor calibration",
        "sensor qualification verification test",
    ],
    "cooling system records": [
        "cooling system maintenance logs",
        "cooling system repair logs",
        "cooling system maintenance records",
        "cooling system performance records",
        "cooling system performance logs",
    ],
    "operator training records": [
        "operator training records",
        "operator competency records",
        "operator training and competency",
        "training and competency records",
    ],
    "batch manufacturing records": [
        "batch manufacturing record",
        "batch production record",
        "bmr",
        "bpr",
    ],
    "temperature control procedures": [
        "temperature control sop",
        "temperature control procedure",
        "temperature control and deviation handling sop",
    ],
    "control system alarm records": [
        "alarm logs",
        "alarm event logs",
        "alarm trip logs",
        "control system alarm",
        "alarm set points",
    ],
    "operator response records": [
        "operator response timestamps",
        "shift logs",
        "manual interventions",
        "operator response records",
    ],
    "maintenance tracking records": [
        "maintenance tracking system records",
        "maintenance tracking records",
        "calibration schedule compliance records",
        "calibration tracking records",
    ],
    "deviation investigation records": [
        "deviation report form",
        "contemporaneous investigation notes",
        "deviation investigation records",
    ],
    "capa records": [
        "capa records",
        "corrective and preventive action records",
    ],
}


def evidence_key(item: str) -> str:
    normalized = normalize_text(item)

    for category, phrases in EVIDENCE_ALIASES.items():
        if any(
            normalize_text(phrase) in normalized
            or normalized in normalize_text(phrase)
            for phrase in phrases
        ):
            return category

    return normalized


def clean_evidence_list(value: Any) -> list[str]:
    items = clean_string_list(value)

    result = []
    seen = set()

    for item in items:
        key = evidence_key(item)

        if not key or key in seen:
            continue

        seen.add(key)
        result.append(item)

    return result


# ============================================================
# EXTRACTION NORMALIZATION
# ============================================================

def normalize_extraction(data: dict) -> dict:
    if not isinstance(data, dict):
        data = {}

    list_fields = [
        "observations",
        "contributing_factors",
        "reported_actions",
        "missing_information",
        "supporting_documents",
    ]

    for field in list_fields:
        data[field] = clean_string_list(
            data.get(field, [])
        )

    data["contributing_factors"] = clean_contributing_factors(
        data["contributing_factors"]
    )

    return data


# ============================================================
# ROOT CAUSE VALIDATION
# ============================================================

def get_reported_source_factors(
    extracted_data: dict,
) -> list[str]:

    return clean_contributing_factors(
        extracted_data.get("contributing_factors", [])
    )


def factor_is_reported(
    cause_label: str,
    reported_factors: list[str],
) -> bool:
    """
    Match only the root-cause label against explicitly reported factors.

    Supporting observations and explanations are deliberately excluded.
    A reported condition is not proof of a causal relationship.
    """

    cause_tokens = set(normalize_text(cause_label).split())

    if not cause_tokens:
        return False

    ignored = {
        "the", "a", "an", "of", "and", "or", "to",
        "due", "because", "may", "might", "could",
        "potential", "possible", "inadequate",
        "insufficient", "inaccurate",
    }

    cause_tokens -= ignored

    for factor in reported_factors:
        factor_normalized = normalize_text(factor)
        factor_tokens = set(factor_normalized.split())
        factor_tokens -= ignored

        if not factor_tokens:
            continue

        # Exact phrase match.
        if factor_normalized in normalize_text(cause_label):
            return True

        # Require substantial overlap, not a generic shared word.
        overlap = len(cause_tokens & factor_tokens)
        smaller_set = min(len(cause_tokens), len(factor_tokens))

        if smaller_set >= 3 and overlap / smaller_set >= 0.75:
            return True

    return False


def validate_root_causes(
    causes: list[dict],
    extracted_data: dict,
) -> tuple[list[dict], list[str]]:

    warnings = []
    reported_factors = get_reported_source_factors(extracted_data)
    source_text = normalize_text(flatten_source_data(extracted_data))

    unsupported_patterns = [
        "absence of sop",
        "lack of sop",
        "no sop",
        "inadequate sop",
        "missing sop",
        "no procedure",
        "operator error",
        "operator training deficiency",
        "lack of operator training",
        "training deficiency",
        "operator may not have been trained",
        "operator failed to respond",
        "delayed operator response",
        "absence of secondary sensor",
        "lack of secondary sensor",
    ]

    validated = []

    for cause in causes:
        if not isinstance(cause, dict):
            continue

        item = dict(cause)

        cause_label = str(
            item.get("cause", item.get("description", ""))
        )

        cause_text = normalize_text(
            " ".join([
                str(item.get("cause", "")),
                str(item.get("description", "")),
                str(item.get("root_cause", "")),
            ])
        )

        unsupported_reason = None

        for pattern in unsupported_patterns:
            if (
                normalize_text(pattern) in cause_text
                and normalize_text(pattern) not in source_text
            ):
                unsupported_reason = (
                    "The source does not establish this "
                    "operator, training, sensor or procedural deficiency."
                )
                break

        explicitly_reported = factor_is_reported(
            cause_label,
            reported_factors,
        )

        # No root cause is marked confirmed automatically.
        if unsupported_reason:
            item["validation_status"] = "needs_evidence"
            item["validation_reason"] = unsupported_reason

        elif explicitly_reported:
            item["validation_status"] = "source_reported"
            item["validation_reason"] = (
                "The condition appears in the source. Its causal "
                "relationship must still be independently verified."
            )

        else:
            item["validation_status"] = "needs_evidence"
            item["validation_reason"] = (
                "The source does not establish this proposed causal "
                "explanation. Additional evidence is required."
            )

        if item["validation_status"] == "needs_evidence":
            warnings.append(
                f"Root cause needs evidence: {cause_label}"
            )

        validated.append(item)

    return validated, clean_string_list(warnings)


# ============================================================
# CAPA VALIDATION
# ============================================================

NUMBER_WORDS = (
    r"zero|one|two|three|four|five|six|seven|eight|nine|ten|"
    r"eleven|twelve|thirteen|fourteen|fifteen|sixteen|"
    r"seventeen|eighteen|nineteen|twenty|thirty|forty|"
    r"fifty|sixty|ninety|hundred"
)

TIME_UNITS = r"days?|weeks?|months?|years?|hours?|minutes?"

INTERVAL_PATTERN = re.compile(
    rf"\b(?:\d+(?:\.\d+)?|{NUMBER_WORDS})"
    rf"\s+(?:consecutive\s+)?{TIME_UNITS}\b",
    re.IGNORECASE,
)

FREQUENCY_PATTERNS = [
    r"\bdaily\b",
    r"\bweekly\b",
    r"\bmonthly\b",
    r"\bquarterly\b",
    r"\bannually\b",
    r"\byearly\b",
    r"\bsemi annually\b",
    r"\btwice a year\b",
    r"\bonce per\s+\w+\b",
    r"\bevery\s+(?:\d+|one|two|three|four|five)\s+"
    r"(?:days?|weeks?|months?|years?)\b",
    r"\bevery\s+(?:day|week|month|quarter|year)\b",
]


def find_time_intervals(value: str) -> list[str]:
    found = [
        match.group(0)
        for match in INTERVAL_PATTERN.finditer(value)
    ]

    normalized = normalize_text(value)

    for pattern in FREQUENCY_PATTERNS:
        found.extend(
            match.group(0)
            for match in re.finditer(pattern, normalized)
        )

    return clean_string_list(found)


def has_documented_sop_deficiency(source_text: str) -> bool:
    patterns = [
        r"\bno sop\b",
        r"\bmissing sop\b",
        r"\binadequate sop\b",
        r"\black of sop\b",
        r"\babsence of sop\b",
        r"\bsop does not\b",
        r"\bsop failed to\b",
        r"\bsop does not specify\b",
        r"\bsop does not define\b",
        r"\bsop lacks\b",
        r"\bprocedure does not specify\b",
        r"\bprocedure does not define\b",
    ]

    return any(
        re.search(pattern, source_text)
        for pattern in patterns
    )


def action_requires_sop_review(action: str) -> bool:
    text = normalize_text(action)

    verbs = (
        r"revise|update|develop|create|issue|modify|rewrite|"
        r"establish|introduce"
    )

    return bool(
        re.search(rf"\b(?:{verbs})\b.{{0,100}}\bsop\b", text)
        or re.search(rf"\bsop\b.{{0,100}}\b(?:{verbs})\b", text)
    )


def find_related_cause(
    related_cause: str,
    causes: list[dict],
) -> dict | None:

    related = normalize_text(related_cause)

    if not related:
        return None

    for cause in causes:
        cause_label = normalize_text(
            cause.get("cause", cause.get("description", ""))
        )

        if cause_label and (
            related == cause_label
            or related in cause_label
            or cause_label in related
        ):
            return cause

    return None


def validate_capa_evidence(
    recommendations: list[dict],
    causes: list[dict],
    extracted_data: dict,
) -> tuple[list[dict], list[str]]:

    warnings = []

    source_text = normalize_text(
        flatten_source_data(extracted_data)
    )

    sop_deficiency = has_documented_sop_deficiency(source_text)

    technical_patterns = [
        "retune pid",
        "retune the pid",
        "modify pid",
        "install a new",
        "implement electronic",
        "new alarm system",
        "new monitoring system",
        "change control logic",
    ]

    validated = []

    for recommendation in recommendations:
        if not isinstance(recommendation, dict):
            continue

        item = dict(recommendation)

        action = str(item.get("action", "")).strip()
        effectiveness = str(item.get("effectiveness_check", ""))

        reasons = []

        action_normalized = normalize_text(action)

        if any(
            normalize_text(pattern) in action_normalized
            for pattern in technical_patterns
        ):
            reasons.append(
                "Proposed technical change requires documented "
                "engineering and QA assessment."
            )

        for field_name, field_value in [
            ("action", action),
            ("effectiveness check", effectiveness),
        ]:
            for interval in find_time_intervals(field_value):
                if normalize_text(interval) not in source_text:
                    reasons.append(
                        f"The {field_name} includes '{interval}', "
                        "which is not established by the supplied source."
                    )

        if action_requires_sop_review(action) and not sop_deficiency:
            reasons.append(
                "Review the current approved SOP and establish a "
                "documented gap before recommending its revision."
            )

        related_cause = find_related_cause(
            str(item.get("related_potential_cause", "")),
            causes,
        )

        if item.get("related_potential_cause") and related_cause is None:
            reasons.append(
                "The linked potential cause could not be matched "
                "to the root-cause list."
            )

        elif related_cause is not None:
            if related_cause.get("validation_status") != "confirmed":
                reasons.append(
                    "The linked potential cause is not confirmed. "
                    "Investigate and verify it before implementing "
                    "a corrective or preventive change."
                )

        item["status"] = "proposed"

        if reasons:
            item["validation_status"] = "requires_review"
            item["validation_reason"] = " ".join(
                clean_string_list(reasons)
            )
            warnings.append(f"CAPA requires review: {action}")
        else:
            item["validation_status"] = "proposed"
            item["validation_reason"] = (
                "Subject to human QA review and approval."
            )

        validated.append(item)

    return validated, clean_string_list(warnings)


# ============================================================
# EXTRACTION GRAPH
# ============================================================

class ExtractionState(TypedDict, total=False):
    source_text: str
    extracted_data: dict


def extract_investigation_node(state: ExtractionState) -> dict:
    prompt = f"""
You are an experienced pharmaceutical API quality investigator.

Extract only factual information explicitly present in the source.

Rules:
- Do not invent values, dates, causes or actions.
- Separate observations from contributing factors.
- Do not declare a confirmed root cause.
- Use null for unavailable scalar values.
- Use empty arrays when information is unavailable.
- An operator noticing an event is not proof of operator error.
- Missing records do not prove a procedural or training deficiency.
- Report contributing factors only when explicitly identified in the source.

Return ONLY valid JSON:

{{
    "title": "",
    "product_name": null,
    "batch_number": null,
    "process": null,
    "equipment": null,
    "deviation_description": "",
    "observations": [],
    "contributing_factors": [],
    "reported_actions": [],
    "missing_information": [],
    "supporting_documents": []
}}

SOURCE TEXT:
{state["source_text"]}
"""

    result = normalize_extraction(invoke_json(prompt))
    return {"extracted_data": result}


extraction_builder = StateGraph(ExtractionState)
extraction_builder.add_node(
    "extract_investigation",
    extract_investigation_node,
)
extraction_builder.add_edge(START, "extract_investigation")
extraction_builder.add_edge("extract_investigation", END)
extraction_graph = extraction_builder.compile()


def run_rca_extraction(source_text: str) -> dict:
    if not source_text or not source_text.strip():
        raise ValueError("Source text cannot be empty.")

    result = extraction_graph.invoke({
        "source_text": source_text.strip()
    })

    return result["extracted_data"]


# ============================================================
# RCA GRAPH STATE
# ============================================================

class RCAState(TypedDict, total=False):
    extracted_data: dict
    method: str
    evidence_assessment: dict
    rca_analysis: dict
    potential_root_causes: list[dict]
    contributing_factors: list[str]
    missing_evidence: list[str]
    root_cause_validation_warnings: list[str]
    root_cause_evaluation_notes: list[str]
    capa_recommendations: list[dict]
    capa_validation_warnings: list[str]
    final_result: dict


# ============================================================
# NODE 1: EVIDENCE ASSESSMENT
# ============================================================

def assess_evidence_node(state: RCAState) -> dict:
    extracted_data = state["extracted_data"]

    prompt = f"""
You are a pharmaceutical API quality investigation specialist.

Assess the quality and completeness of the supplied information.

Rules:
- Distinguish narrative statements from original records.
- A record not supplied is an evidence gap, not proof of failure.
- Do not infer a process failure from missing documentation.
- Identify records needed to test hypotheses.
- Do not classify observations as contributing factors.

Return ONLY valid JSON:

{{
    "documented_facts": [],
    "available_evidence": [],
    "evidence_gaps": [],
    "conflicting_information": [],
    "investigation_questions": [],
    "evidence_quality": "limited"
}}

evidence_quality must be limited, moderate or strong.

SOURCE:
{json.dumps(extracted_data, ensure_ascii=False, default=str)}
"""

    result = invoke_json(prompt)

    for field in [
        "documented_facts",
        "available_evidence",
        "evidence_gaps",
        "conflicting_information",
        "investigation_questions",
    ]:
        result[field] = clean_string_list(result.get(field, []))

    result["documented_facts"] = clean_string_list(
        result["documented_facts"]
        + extracted_data.get("observations", [])
    )

    result["evidence_gaps"] = clean_evidence_list(
        result["evidence_gaps"]
    )

    # Only actual supplied primary records belong here.
    result["available_evidence"] = clean_string_list(
        result["available_evidence"]
    )

    return {
        "evidence_assessment": result,
        "missing_evidence": result["evidence_gaps"],
    }


# ============================================================
# NODE 2: FIVE WHYS / FISHBONE
# ============================================================

def perform_rca_analysis_node(state: RCAState) -> dict:
    extracted_data = state["extracted_data"]
    evidence = state["evidence_assessment"]
    method = state["method"]

    if method == "five_whys":
        method_instructions = """
Perform a Five Whys analysis.

Return exactly five steps. Each step must include:
- why_number
- question
- answer
- evidence_status

Allowed evidence_status:
source_reported, needs_evidence, not_established.

Do not force an unsupported causal chain.
"""
    else:
        method_instructions = """
Perform a Fishbone analysis with exactly six categories:
Man, Machine, Method, Material, Measurement, Environment.

Each category must contain:
- category
- potential_factors
- supporting_evidence
- evidence_gaps

All three list fields must contain strings only.

Do not put absence statements in potential_factors.
Do not treat missing records as proof of failure.
Do not treat an operator observation as proof of operator error.
Keep unsupported hypotheses clearly labelled as potential factors.
"""

    prompt = f"""
You are a senior pharmaceutical API root-cause investigation expert.

{method_instructions}

Also return:
- problem_statement
- potential_root_causes
- contributing_factors
- missing_evidence

Each potential root cause must contain:
- cause
- explanation
- supporting_observations
- evidence_required
- confidence

Confidence must be low, medium or high.

Rules:
- Root causes are hypotheses, never confirmed facts.
- A reported condition does not prove its causal relationship.
- Do not invent records, limits, dates or events.
- Do not infer operator error or SOP deficiency.
- Missing documentation is an evidence gap, not a cause.

Return ONLY valid JSON:

{{
    "problem_statement": "",
    "five_whys": [],
    "fishbone": [],
    "potential_root_causes": [],
    "contributing_factors": [],
    "missing_evidence": []
}}

SOURCE:
{json.dumps(extracted_data, ensure_ascii=False, default=str)}

EVIDENCE:
{json.dumps(evidence, ensure_ascii=False, default=str)}
"""

    result = invoke_json(prompt)

    result["potential_root_causes"] = clean_dict_list(
        result.get("potential_root_causes", [])
    )

    result["contributing_factors"] = clean_contributing_factors(
        result.get("contributing_factors", [])
        + extracted_data.get("contributing_factors", [])
    )

    result["missing_evidence"] = clean_evidence_list(
        result.get("missing_evidence", [])
    )

    if method == "five_whys":
        result["five_whys"] = clean_dict_list(
            result.get("five_whys", [])
        )[:5]

        while len(result["five_whys"]) < 5:
            number = len(result["five_whys"]) + 1
            result["five_whys"].append({
                "why_number": number,
                "question": f"Why {number}?",
                "answer": "Not established from available information.",
                "evidence_status": "needs_evidence",
            })

        result["fishbone"] = []

    else:
        result["fishbone"] = normalize_fishbone(
            result.get("fishbone", [])
        )
        result["five_whys"] = []

    return {
        "rca_analysis": result,
        "potential_root_causes": result["potential_root_causes"],
        "contributing_factors": result["contributing_factors"],
        "missing_evidence": result["missing_evidence"],
    }


# ============================================================
# FISHBONE NORMALIZATION
# ============================================================

FISHBONE_CATEGORIES = [
    "Man",
    "Machine",
    "Method",
    "Material",
    "Measurement",
    "Environment",
]


def normalize_fishbone(value: Any) -> list[dict]:
    items = clean_dict_list(value)
    normalized_items = {}

    for item in items:
        category = str(item.get("category", "")).strip().lower()

        matched = next(
            (
                name for name in FISHBONE_CATEGORIES
                if name.lower() == category
            ),
            None,
        )

        if not matched:
            continue

        target = normalized_items.setdefault(
            matched,
            {
                "category": matched,
                "potential_factors": [],
                "supporting_evidence": [],
                "evidence_gaps": [],
            },
        )

        target["potential_factors"].extend(
            clean_string_list(item.get("potential_factors", []))
        )

        target["supporting_evidence"].extend(
            clean_string_list(item.get("supporting_evidence", []))
        )

        target["evidence_gaps"].extend(
            clean_string_list(item.get("evidence_gaps", []))
        )

    result = []

    for category in FISHBONE_CATEGORIES:
        item = normalized_items.get(
            category,
            {
                "category": category,
                "potential_factors": [],
                "supporting_evidence": [],
                "evidence_gaps": [],
            },
        )

        factors = [
            factor
            for factor in clean_string_list(item["potential_factors"])
            if not is_placeholder_factor(factor)
            and not is_observation_only(factor)
        ]

        evidence_items = [
            evidence_item
            for evidence_item in clean_string_list(
                item["supporting_evidence"]
            )
            if not is_placeholder_factor(evidence_item)
        ]

        # "No equipment breakdown" is a reported condition, not
        # evidence that a particular equipment factor caused the event.
        evidence_items = [
            evidence_item
            for evidence_item in evidence_items
            if normalize_text(evidence_item) !=
            normalize_text("No equipment breakdown")
        ]

        unverified = []

        if category == "Man":
            for factor in factors:
                normalized = normalize_text(factor)

                if any(term in normalized for term in [
                    "operator may not have been trained",
                    "lack of operator training",
                    "training deficiency",
                    "operator error",
                    "operator response limitation",
                ]):
                    unverified.append({
                        "factor": factor,
                        "validation_status": "needs_evidence",
                        "validation_reason": (
                            "Training or operator deficiency has not "
                            "been established. Review training and "
                            "competency records before drawing a conclusion."
                        ),
                    })

        # Frontend-compatible fields remain arrays of strings.
        item["potential_factors"] = factors
        item["supporting_evidence"] = clean_string_list(evidence_items)
        item["evidence_gaps"] = clean_evidence_list(
            item["evidence_gaps"]
        )
        item["unverified_hypotheses"] = unverified

        result.append(item)

    return result


# ============================================================
# NODE 3: ROOT CAUSE EVALUATION
# ============================================================

def evaluate_root_causes_node(state: RCAState) -> dict:
    extracted_data = state["extracted_data"]
    analysis = state["rca_analysis"]

    prompt = f"""
You are an independent pharmaceutical quality reviewer.

Review proposed root causes.

Rules:
- Merge duplicate and overlapping hypotheses.
- Separate reported conditions from causal conclusions.
- Do not treat missing records as proof of failure.
- Do not claim operator delay without timeline evidence.
- Do not claim SOP deficiency because an SOP was not cited.
- Keep observations separate from causes.
- Preserve plausible hypotheses and list evidence needed.
- Do not mark any root cause as confirmed.

Return ONLY valid JSON:

{{
    "potential_root_causes": [
        {{
            "cause": "",
            "explanation": "",
            "supporting_observations": [],
            "evidence_required": [],
            "confidence": "low"
        }}
    ],
    "contributing_factors": [],
    "evaluation_notes": []
}}

SOURCE:
{json.dumps(extracted_data, ensure_ascii=False, default=str)}

PROPOSED RCA:
{json.dumps(analysis, ensure_ascii=False, default=str)}
"""

    result = invoke_json(prompt)

    causes = clean_dict_list(
        result.get("potential_root_causes", [])
    )

    causes, warnings = validate_root_causes(
        causes,
        extracted_data,
    )

    evaluated_factors = result.get("contributing_factors", [])

    if not isinstance(evaluated_factors, list):
        evaluated_factors = []

    return {
        "potential_root_causes": causes,
        "contributing_factors": clean_contributing_factors(
            evaluated_factors
            + extracted_data.get("contributing_factors", [])
        ),
        "root_cause_validation_warnings": warnings,
        "root_cause_evaluation_notes": clean_string_list(
            result.get("evaluation_notes", [])
        ),
    }


# ============================================================
# NODE 4: CAPA GENERATION
# ============================================================

def generate_capa_node(state: RCAState) -> dict:
    extracted_data = state["extracted_data"]
    causes = state["potential_root_causes"]
    evidence = state["evidence_assessment"]

    # A source-reported condition is NOT a confirmed root cause.
    # Corrective/preventive actions are held until confirmation.
    confirmed_causes = [
        cause for cause in causes
        if cause.get("validation_status") == "confirmed"
    ]

    if not confirmed_causes:
        capa_mode = """
Only generate investigation/verification actions.

Allowed action_type:
- investigation

Do NOT generate:
- corrective actions
- preventive actions
- new SOPs
- training programmes
- alarm configuration changes
- engineering modifications
- new electronic systems
- recurring maintenance schedules

The root causes are not confirmed. First obtain and review evidence.
Generate a concise list of distinct investigation actions.
Do not create one CAPA for every evidence gap.
Maximum 6 recommendations.
"""
    else:
        capa_mode = """
Generate risk-based investigation and CAPA recommendations.

Corrective or preventive actions may only be linked to a confirmed cause.
Do not invent frequencies, deadlines, owners or acceptance criteria.
Maximum 8 recommendations.
"""

    prompt = f"""
You are a pharmaceutical CAPA specialist.

{capa_mode}

Each recommendation must contain:
- action
- action_type
- related_potential_cause
- rationale
- owner
- target_date
- effectiveness_check
- status

Rules:
- Leave owner and target_date null when unknown.
- Status must always be proposed.
- Do not invent numerical acceptance criteria.
- Do not invent regulatory requirements.
- Do not classify record retrieval alone as corrective action.
- Avoid duplicate or overlapping recommendations.
- Effectiveness checks must not contain invented time periods.
- Every recommendation requires human QA review.

Return ONLY valid JSON:

{{
    "capa_recommendations": []
}}

SOURCE:
{json.dumps(extracted_data, ensure_ascii=False, default=str)}

POTENTIAL ROOT CAUSES:
{json.dumps(causes, ensure_ascii=False, default=str)}

EVIDENCE ASSESSMENT:
{json.dumps(evidence, ensure_ascii=False, default=str)}
"""

    result = invoke_json(prompt)

    recommendations = clean_dict_list(
        result.get("capa_recommendations", [])
    )

    unique = []
    seen = set()

    for recommendation in recommendations:
        item = dict(recommendation)
        action = str(item.get("action", "")).strip()

        if not action:
            continue

        key = dedupe_key(action)

        if key in seen:
            continue

        seen.add(key)

        item.setdefault("owner", None)
        item.setdefault("target_date", None)
        item["status"] = "proposed"

        # Enforce investigation-only recommendations while causes
        # remain unconfirmed, even if the LLM ignores the prompt.
        if not confirmed_causes:
            if item.get("action_type") != "investigation":
                continue

        unique.append(item)

    validated, warnings = validate_capa_evidence(
        unique,
        causes,
        extracted_data,
    )

    return {
        "capa_recommendations": validated,
        "capa_validation_warnings": warnings,
    }


# ============================================================
# NODE 5: FINAL VALIDATION
# ============================================================

def validate_final_result_node(state: RCAState) -> dict:
    analysis = state["rca_analysis"]
    evidence = state["evidence_assessment"]
    method = state["method"]

    causes = state["potential_root_causes"]

    factors = clean_contributing_factors(
        state["contributing_factors"]
    )

    capas = state["capa_recommendations"]

    # Merge evidence gaps from all stages and deduplicate.
    all_missing_evidence = (
        evidence.get("evidence_gaps", [])
        + state.get("missing_evidence", [])
    )

    for cause in causes:
        all_missing_evidence.extend(
            clean_string_list(cause.get("evidence_required", []))
        )

    missing_evidence = clean_evidence_list(
        all_missing_evidence
    )

    # Keep the evidence assessment consistent with the final list.
    evidence["evidence_gaps"] = clean_evidence_list(
        evidence.get("evidence_gaps", [])
    )

    all_warnings = clean_string_list(
        state.get("root_cause_validation_warnings", [])
        + state.get("capa_validation_warnings", [])
    )

    five_whys = (
        analysis.get("five_whys", [])
        if method == "five_whys"
        else []
    )

    fishbone = (
        analysis.get("fishbone", [])
        if method == "fishbone"
        else []
    )

    final_result = {
        "method": method,
        "problem_statement": analysis.get("problem_statement", ""),
        "five_whys": five_whys,
        "fishbone": fishbone,
        "potential_root_causes": causes,
        "contributing_factors": factors,
        "missing_evidence": missing_evidence,
        "evidence_assessment": evidence,
        "root_cause_evaluation_notes": state.get(
            "root_cause_evaluation_notes", []
        ),
        "capa_recommendations": capas,
        "validation_warnings": all_warnings,
        "human_review_required": True,
        "investigation_status": "pending_human_review",
    }

    return {"final_result": final_result}


# ============================================================
# BUILD RCA LANGGRAPH
# ============================================================

rca_builder = StateGraph(RCAState)

rca_builder.add_node("assess_evidence", assess_evidence_node)
rca_builder.add_node("perform_rca_analysis", perform_rca_analysis_node)
rca_builder.add_node("evaluate_root_causes", evaluate_root_causes_node)
rca_builder.add_node("generate_capa", generate_capa_node)
rca_builder.add_node("validate_final_result", validate_final_result_node)

rca_builder.add_edge(START, "assess_evidence")
rca_builder.add_edge("assess_evidence", "perform_rca_analysis")
rca_builder.add_edge("perform_rca_analysis", "evaluate_root_causes")
rca_builder.add_edge("evaluate_root_causes", "generate_capa")
rca_builder.add_edge("generate_capa", "validate_final_result")
rca_builder.add_edge("validate_final_result", END)

rca_graph = rca_builder.compile()


# ============================================================
# PUBLIC RCA FUNCTION
# ============================================================

def run_rca_analysis(
    extracted_data: dict,
    method: str = "five_whys",
) -> dict:

    if not isinstance(extracted_data, dict) or not extracted_data:
        raise ValueError(
            "Extracted investigation data is required."
        )

    method = method.strip().lower()

    if method not in ("five_whys", "fishbone"):
        raise ValueError(
            "Invalid RCA method. Use 'five_whys' or 'fishbone'."
        )

    extracted_data = normalize_extraction(
        dict(extracted_data)
    )

    initial_state: RCAState = {
        "extracted_data": extracted_data,
        "method": method,
    }

    result = rca_graph.invoke(initial_state)

    return result["final_result"]
