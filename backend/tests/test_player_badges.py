import pytest
from game_table.table.player_badge import badge_options, validate_badge, valid_badge


def test_options_always_start_with_the_first_word():
    assert badge_options("El Papa de Chepe") == ["E", "EP", "ED", "EC"]
    assert badge_options("  El   Papa  de Chepe  ") == ["E", "EP", "ED", "EC"]
    assert badge_options("Alice") == ["A"]
    assert badge_options("Ana Ana Alba") == ["A", "AA"]


def test_unrelated_and_overlong_badges_are_rejected():
    for label in ["PC", "P", "EPDC", "X", ""]:
        with pytest.raises(ValueError):
            validate_badge("El Papa de Chepe", label)
    assert validate_badge("El Papa de Chepe", "EC") == "EC"


def test_name_changes_reset_invalid_choices_and_preserve_valid_ones():
    assert valid_badge("El Chepe", "EC") == "EC"
    assert valid_badge("El Gato", "EC") is None
    assert valid_badge("El Gato", None) is None
