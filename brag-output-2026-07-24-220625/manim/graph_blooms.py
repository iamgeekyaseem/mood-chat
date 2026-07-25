"""Beat 3 — "Graph blooms" (8.7-12.7s in the brag timeline).

Grey main spine drops from the root/reply thread, then blue / amber / magenta
strands fan out from the end of the spine into three branch cards. Every
strand is a Line/CurvedArrow anchored to the actual card mobjects (see
branch_theme.connector) and to a Dot marking the trunk point — never a
hand-typed left/top/width/rotate() like the previous, broken HTML version.

Content matches the rest of the storyboard (brag-plan.md beat 1-2): the
"p value" branch from the hook, plus two more tangents off the same reply.

Smoke test:
    manim -ql --transparent graph_blooms.py GraphBlooms

Final render:
    manim -qh --transparent graph_blooms.py GraphBlooms
"""

from manim import DOWN, LEFT, RIGHT, UP, Create, Dot, FadeIn, GrowFromCenter, Scene, config

from branch_theme import AMBER, BLUE, MAGENTA, NEUTRAL_STROKE, connector, make_branch_card, make_card

config.background_color = "#171614"


class GraphBlooms(Scene):
    def construct(self):
        root = make_card("explain regression", NEUTRAL_STROKE, width=3.6, height=0.85, font_size=24)
        root.move_to([-5.0, 3.0, 0])

        reply = make_card("p value · residuals · fit", NEUTRAL_STROKE, width=3.6, height=0.85, font_size=22)
        reply.move_to([-5.0, 1.9, 0])

        trunk = Dot(reply.rect.get_edge_center(DOWN) + DOWN * 1.0, radius=0.06, color=NEUTRAL_STROKE)

        spine = connector(root.rect, reply.rect, NEUTRAL_STROKE, start_edge=DOWN, end_edge=UP, stroke_width=5)
        trunk_drop = connector(reply.rect, trunk, NEUTRAL_STROKE, start_edge=DOWN, end_edge=UP, stroke_width=5)

        # Kept within y +-2.95 (matching three_models.py's vertical footprint)
        # so the bottom caption band stays clear of card content.
        branch_a = make_branch_card("p value", "what does it mean?", BLUE)
        branch_a.move_to([2.6, 2.3, 0])
        branch_b = make_branch_card("residuals", "show me the plot", AMBER)
        branch_b.move_to([3.0, -0.1, 0])
        branch_c = make_branch_card("overfitting", "how do I avoid it?", MAGENTA)
        branch_c.move_to([2.6, -2.3, 0])

        strand_a = connector(trunk, branch_a.rect, BLUE, start_edge=UP, end_edge=LEFT, curve_angle=-0.35)
        strand_b = connector(trunk, branch_b.rect, AMBER, start_edge=UP, end_edge=LEFT, curve_angle=0.0)
        strand_c = connector(trunk, branch_c.rect, MAGENTA, start_edge=UP, end_edge=LEFT, curve_angle=0.35)

        # Compressed to land fully within the 4.0s beat slot (8.7-12.7s in the
        # brag timeline) with a short hold, mirroring the original beat pacing.
        self.play(FadeIn(root), run_time=0.45)
        self.play(FadeIn(reply), Create(spine), run_time=0.45)
        self.play(Create(trunk_drop), GrowFromCenter(trunk), run_time=0.35)
        self.play(Create(strand_a), Create(strand_b), Create(strand_c), run_time=0.75)
        self.play(FadeIn(branch_a), FadeIn(branch_b), FadeIn(branch_c), run_time=0.75)
        self.wait(1.0)
