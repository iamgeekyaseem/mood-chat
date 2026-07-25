"""Shared palette and node/connector helpers for the Branch launch-video diagram
scenes. Pulled straight from frontend/src/colors.ts (dark-mode values) so the
clips match the real app exactly.

The one rule every scene here follows: a connector's endpoints are ALWAYS
Manim anchor calls on the actual node mobjects (get_right/get_left/get_top/
get_bottom/get_center), never a hand-typed coordinate, width, or rotation.
That is what makes it structurally impossible for a line to miss the card it
is supposed to touch.
"""

from manim import (
    DOWN,
    LEFT,
    RIGHT,
    UP,
    Circle,
    CurvedArrow,
    Line,
    RoundedRectangle,
    Text,
    VGroup,
)

BG = "#171614"
INK = "#f4f2ed"
INK_DIM = "#9a948b"
NEUTRAL_STROKE = "#6f6a62"

BLUE = "#3987e5"
AMBER = "#c98500"
MAGENTA = "#d55181"

CARD_FILL = "#1f1e1b"


def make_card(label: str, color: str, *, width: float = 3.2, height: float = 0.9, font_size: int = 26) -> VGroup:
    """A single-line card (root/question nodes): coloured stroke + label. Per
    the app's own colour law (frontend/src/colors.ts), colour is never the
    only encoding — the label always renders with it."""
    rect = RoundedRectangle(
        width=width,
        height=height,
        corner_radius=0.14,
        fill_color=CARD_FILL,
        fill_opacity=1.0,
        stroke_color=color,
        stroke_width=3,
    )
    text = Text(label, font_size=font_size, color=INK)
    text.move_to(rect.get_center())
    if text.width > rect.width - 0.3:
        text.scale_to_fit_width(rect.width - 0.3)
        text.move_to(rect.get_center())
    card = VGroup(rect, text)
    card.rect = rect  # anchor target for connectors
    return card


def make_branch_card(
    tag: str,
    body: str,
    color: str,
    *,
    width: float = 3.7,
    height: float = 1.3,
    tag_font_size: int = 20,
    body_font_size: int = 24,
) -> VGroup:
    """Two-line branch card mirroring the app's `.node.branch` style: a small
    dot + tag row (the branch identity), then a body line underneath. Matches
    frontend/src/colors.ts's rule that colour is never the sole encoding."""
    rect = RoundedRectangle(
        width=width,
        height=height,
        corner_radius=0.14,
        fill_color=CARD_FILL,
        fill_opacity=1.0,
        stroke_color=color,
        stroke_width=3,
    )
    dot = Circle(radius=0.06, fill_color=color, fill_opacity=1.0, stroke_width=0)
    tag_text = Text(f"⑂ {tag}", font_size=tag_font_size, color=INK_DIM)
    body_text = Text(body, font_size=body_font_size, color=INK)
    if body_text.width > width - 0.35:
        body_text.scale_to_fit_width(width - 0.35)

    head_row = VGroup(dot, tag_text).arrange(RIGHT, buff=0.12)
    content = VGroup(head_row, body_text).arrange(DOWN, aligned_edge=LEFT, buff=0.18)
    content.move_to(rect.get_center())
    content.align_to(rect, LEFT).shift(RIGHT * 0.28)

    card = VGroup(rect, content)
    card.rect = rect
    return card


def connector(
    start_mobject,
    end_mobject,
    color: str,
    *,
    start_edge=RIGHT,
    end_edge=LEFT,
    curve_angle: float = 0.0,
    stroke_width: float = 4,
):
    """A connector line whose endpoints are derived from the real edge points
    of the two mobjects it joins — never a manually guessed angle/length."""
    start = start_mobject.get_edge_center(start_edge)
    end = end_mobject.get_edge_center(end_edge)
    if curve_angle == 0.0:
        return Line(start, end, color=color, stroke_width=stroke_width)
    return CurvedArrow(
        start,
        end,
        angle=curve_angle,
        color=color,
        stroke_width=stroke_width,
        tip_length=0.0001,
    )
