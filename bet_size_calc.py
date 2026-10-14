#!/usr/bin/python3
# bet_size_calc.py by Magal Horesh
# This is a bet sizing calculator

from tkinter import DoubleVar
from tkinter import StringVar
from tkinter import LEFT
from tkinter import END
from tkinter import ttk
from decimal import Decimal


class BetSizeCalc(ttk.Frame):

    def __init__(self, parent):
        ttk.Frame.__init__(self, parent)

        self.bet_size = DoubleVar()

        # create frame
        self.bet_size_frame = ttk.Frame(self, padding=(20, 5))
        self.bet_size_label = ttk.Label(
            self.bet_size_frame, text='Bet Size', style='InputLabel.TLabel')
        self.bet_size_label.pack(side=LEFT)
        self.bet_size_entry = ttk.Entry(
            self.bet_size_frame, textvariable=self.bet_size)
        self.bet_size_entry.pack(side=LEFT)
        self.bet_size_frame.pack()

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
        self.four_bet_in_position_text = StringVar()
        self.four_bet_out_off_position_text = StringVar()
        self.three_bet_in_position_text = StringVar()
        self.three_bet_out_off_position_text = StringVar()

        self.four_bet_in_position_label = ttk.Label(
            self, textvariable=self.four_bet_in_position_text,
            style='ResultLabel.TLabel').pack()
        self.four_bet_out_off_position_label = ttk.Label(
            self, textvariable=self.four_bet_out_off_position_text,
            style='ResultLabel.TLabel').pack()
        self.three_bet_in_position_label = ttk.Label(
            self, textvariable=self.three_bet_in_position_text,
            style='ResultLabel.TLabel').pack()
        self.three_bet_out_off_position_label = ttk.Label(
            self, textvariable=self.three_bet_out_off_position_text,
            style='ResultLabel.TLabel').pack()

    def handle_go_button(self):
        self.four_bet_in_position_text.set(
            f'2.4x = {self.calc_bet_size(2.4)}')
        self.four_bet_out_off_position_text.set(
            f'2.6x = {self.calc_bet_size(2.6)}')
        self.three_bet_in_position_text.set(
            f'3x = {self.calc_bet_size(3)}')
        self.three_bet_out_off_position_text.set(
            f'4x = {self.calc_bet_size(4)}')

    def calc_bet_size(self, product):
        return round(Decimal(self.bet_size.get() * product), 1)

    def handle_clear_button(self):
        self.delete_entries_text()
        self.clear_results_labels()

    def delete_entries_text(self):
        self.bet_size_entry.delete(0, END)

    def clear_results_labels(self):
        self.four_bet_in_position_text.set('')
        self.four_bet_out_off_position_text.set('')
        self.three_bet_in_position_text.set('')
        self.three_bet_out_off_position_text.set('')
