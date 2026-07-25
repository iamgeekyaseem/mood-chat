"""Beat 2 — "The main thread never moves" (4.5-8.9s in the brag timeline).

Replaces the old hand-typed CSS version of this diagram (`#s2-strand` in
index.html: `left/top/width` + `transform: rotate(19deg)`, independent of the
`#s2-branch` card's real position), which is the same class of bug already
fixed for Beats 3/4 (see graph_blooms.py). Here too, the connector is a
`Line` anchored to the real node mobjects via branch_theme.connector() — it
cannot end up short of the card it's meant to touch.

Smoke test:
    manim -ql --transparent main_thread.py MainThread

Final render:
    manim -qh --transparent main_thread.py MainThread
"""

from manim import DOWN, LEFT, RIGHT, Create, FadeIn, Scene, UP, config

from branch_theme import BLUE, NEUTRAL_STROKE, connector, make_branch_card, make_card

config.background_color = "#171614"


class MainThread(Scene):
    def construct(self):
        you = make_card("explain regression to me", NEUTRAL_STROKE, width=4.4, height=0.85, font_size=24)
        you.move_to([-4.6, 1.55, 0])

        reply = make_card(
            "…the p value tells you whether it's significant.",
            NEUTRAL_STROKE,
            width=4.4,
            height=1.05,
            font_size=22,
        )
        reply.move_to([-4.6, 0.1, 0])

        spine = connector(you.rect, reply.rect, NEUTRAL_STROKE, start_edge=DOWN, end_edge=UP, stroke_width=5)

        branch = make_branch_card(
            "p value",
            "A p-value is the probability of a result this extreme if nothing were going on.",
            BLUE,
            width=4.7,
            height=1.5,
        )
        branch.move_to([2.2, 0.1, 0])

        strand = connector(reply.rect, branch.rect, BLUE, start_edge=RIGHT, end_edge=LEFT, stroke_width=4)

        # main thread settles first and is never touched again, proving it doesn't move
        self.play(FadeIn(you), run_time=0.35)
        self.play(FadeIn(reply), Create(spine), run_time=0.45)
        self.play(Create(strand), run_time=0.55)
        self.play(FadeIn(branch), run_time=0.45)
        self.wait(2.2)
