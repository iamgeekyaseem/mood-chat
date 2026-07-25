"""Beat 4 — "Ask three models at once" (11.5-16.5s in the brag timeline).

One question card fans into three branch cards labelled claude-opus-4-8,
gpt-5, and gemma3:4b, each in its branch colour, each with its own answer
line — matching the prior storyboard's content exactly. Every connector is
anchored to the actual question/branch card mobjects (branch_theme.connector),
so it cannot end up detached from the card it's meant to touch.

Smoke test:
    manim -ql --transparent multi_model.py MultiModel

Final render:
    manim -qh --transparent multi_model.py MultiModel
"""

from manim import DOWN, LEFT, RIGHT, UP, Create, FadeIn, Scene, config

from branch_theme import AMBER, BLUE, MAGENTA, NEUTRAL_STROKE, connector, make_branch_card, make_card

config.background_color = "#171614"


class MultiModel(Scene):
    def construct(self):
        question = make_card("define it in one line", NEUTRAL_STROKE, width=3.8, height=0.85, font_size=24)
        question.move_to([-4.6, 0, 0])

        opus = make_branch_card("claude-opus-4-8", "The chance your result is a fluke.", BLUE, width=4.1)
        opus.move_to([2.9, 2.3, 0])
        gpt = make_branch_card("gpt-5", "Probability the null explains the data.", AMBER, width=4.1)
        gpt.move_to([2.9, 0, 0])
        gemma = make_branch_card("gemma3:4b", "How surprising the data is by chance.", MAGENTA, width=4.1)
        gemma.move_to([2.9, -2.3, 0])

        strand_opus = connector(question.rect, opus.rect, BLUE, start_edge=RIGHT, end_edge=LEFT, curve_angle=-0.4)
        strand_gpt = connector(question.rect, gpt.rect, AMBER, start_edge=RIGHT, end_edge=LEFT, curve_angle=0.0)
        strand_gemma = connector(question.rect, gemma.rect, MAGENTA, start_edge=RIGHT, end_edge=LEFT, curve_angle=0.4)

        self.play(FadeIn(question))
        self.play(Create(strand_opus), Create(strand_gpt), Create(strand_gemma), run_time=1.0)
        self.play(FadeIn(opus), FadeIn(gpt), FadeIn(gemma))
        self.wait(1.0)
