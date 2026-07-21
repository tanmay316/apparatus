"""
Unit Converter Tool.
Converts between common food measurement units.
"""
from typing import Optional

# Conversion factors to grams
UNIT_TO_GRAMS: dict = {
    "g": 1.0,
    "grams": 1.0,
    "gram": 1.0,
    "kg": 1000.0,
    "oz": 28.35,
    "ounce": 28.35,
    "ounces": 28.35,
    "lb": 453.59,
    "lbs": 453.59,
    "pound": 453.59,
    "pounds": 453.59,
    "cup": 240.0,      # approximate for most foods
    "cups": 240.0,
    "tbsp": 15.0,
    "tablespoon": 15.0,
    "tablespoons": 15.0,
    "tsp": 5.0,
    "teaspoon": 5.0,
    "teaspoons": 5.0,
    "ml": 1.0,
    "liter": 1000.0,
    "litre": 1000.0,
    "piece": 100.0,    # default assumption
    "pieces": 100.0,
    "slice": 30.0,
    "slices": 30.0,
    "serving": 150.0,
    "servings": 150.0,
    "bowl": 300.0,
    "plate": 350.0,
    "handful": 30.0,
    "scoop": 30.0,
    "glass": 250.0,
}


def convert_to_grams(amount: float, unit: str) -> float:
    """Convert an amount with a unit to grams."""
    unit_lower = unit.lower().strip()
    factor = UNIT_TO_GRAMS.get(unit_lower, 100.0)
    return round(amount * factor, 1)


def convert_grams_to(grams: float, target_unit: str) -> float:
    """Convert grams to another unit."""
    unit_lower = target_unit.lower().strip()
    factor = UNIT_TO_GRAMS.get(unit_lower, 100.0)
    if factor == 0:
        return 0.0
    return round(grams / factor, 2)


def parse_quantity_string(text: str) -> tuple:
    """
    Parse strings like '2 cups', '150g', '3 slices' into (amount, unit).
    Returns (amount_float, unit_string).
    """
    import re
    match = re.match(r"(\d+\.?\d*)\s*(.*)", text.strip())
    if match:
        amount = float(match.group(1))
        unit = match.group(2).strip() or "g"
        return (amount, unit)
    return (100.0, "g")  # default
