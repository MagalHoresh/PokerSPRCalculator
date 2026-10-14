#!/usr/bin/python3
# e_calc.py by Magal Horesh
# This is 2e and 3e calculator

from tkinter import DoubleVar
from tkinter import StringVar
from tkinter import LEFT
from tkinter import END
from tkinter import ttk
from decimal import Decimal
from sympy.solvers import solve
from sympy import Symbol


class ECalc(ttk.Frame):

    def __init__(self, parent):
        ttk.Frame.__init__(self, parent)

        self.stack_size = DoubleVar()
        self.pot_size = DoubleVar()
        self.spr = 0

        # create stack size frame
        self.stack_size_frame = ttk.Frame(self, padding=(20, 5))
        self.stack_size_label = ttk.Label(
            self.stack_size_frame, text='Stack Size', style='InputLabel.TLabel')
        self.stack_size_label.pack(side=LEFT)
        self.stack_size_entry = ttk.Entry(
            self.stack_size_frame, textvariable=self.stack_size)
        self.stack_size_entry.pack(side=LEFT)
        self.stack_size_frame.pack()

        # create pot size frame
        self.pot_size_frame = ttk.Frame(self, padding=(20, 5))
        self.pot_size_label = ttk.Label(
            self.pot_size_frame, text=' Pot Size    ', style='InputLabel.TLabel')
        self.pot_size_label.pack(side=LEFT)
        self.pot_size_entry = ttk.Entry(
            self.pot_size_frame, textvariable=self.pot_size)
        self.pot_size_entry.pack(side=LEFT)
        self.pot_size_frame.pack()

        self.delete_entries_text()

        # create buttons
        self.buttons_frame = ttk.Frame(self, padding=(20, 10))
        self.go_button = ttk.Button(
            self.buttons_frame, text="Go!", command=self.handle_go_button,
            style='Button.TButton').pack(side=LEFT)
        self.clear_button = ttk.Button(
            self.buttons_frame, text="Clear", command=self.handle_clear_button,
            style='Button.TButton').pack(side=LEFT)
        self.buttons_frame.pack()

        # create results labels
        self.spr_text = StringVar()
        self.two_e_text = StringVar()
        self.three_e_text = StringVar()
        self.spr_label = ttk.Label(
            self, textvariable=self.spr_text, style='InputLabel.TLabel').pack()
        self.two_e_label = ttk.Label(
            self, textvariable=self.two_e_text, style='ResultLabel.TLabel').pack()
        self.three_e_label = ttk.Label(
            self, textvariable=self.three_e_text, style='ResultLabel.TLabel').pack()

    def handle_go_button(self):
        self.spr = round(
            Decimal(self.stack_size.get() / self.pot_size.get()), 2)
        x = Symbol('x')
        two_e = self.solve_e_equation(2*x**2 + 2*x - self.spr)
        three_e = self.solve_e_equation(4*x**3 + 6*x**2 + 3*x - self.spr)

        self.spr_text.set(f'SPR = {self.spr}')
        if two_e <= 100:
            bet_size = self.calc_bet_size(two_e)
            self.two_e_text.set(f'2e = {two_e}% (bet: {bet_size})')
        else:
            self.two_e_text.set(f'2e = {two_e}% (prefer 3e)')
        bet_size = self.calc_bet_size(three_e)
        self.three_e_text.set(f'3e = {three_e}% (bet: {bet_size})')

    def solve_e_equation(self, equation):
        solutions = solve(equation)
        for sol in solutions:
            if sol > 0:
                return round(sol * 100)
        return None

    def calc_bet_size(self, percent):
        return round(Decimal(str(self.pot_size.get() * percent / 100)), 1)

    def handle_clear_button(self):
        self.delete_entries_text()
        self.clear_results_labels()

    def delete_entries_text(self):
        self.stack_size_entry.delete(0, END)
        self.pot_size_entry.delete(0, END)

    def clear_results_labels(self):
        self.spr_text.set('')
        self.two_e_text.set('')
        self.three_e_text.set('')
