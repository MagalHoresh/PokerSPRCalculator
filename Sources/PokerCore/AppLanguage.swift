public enum AppLanguage: String, CaseIterable, Sendable {
    case english = "en"
    case hebrew = "he"

    public var isRightToLeft: Bool { self == .hebrew }
    public var segmentTitle: String { self == .english ? "EN" : "עב" }
    public var nativeName: String { self == .english ? "English" : "עברית" }

    // Isolate Latin tokens in Hebrew prose, never in parsed or copied amounts.
    public func numericToken(_ value: String) -> String {
        isRightToLeft ? "\u{2066}\(value)\u{2069}" : value
    }

    public func text(_ key: AppText) -> String {
        let copy: (english: String, hebrew: String)
        switch key {
        case .language:
            copy = ("Language", "שפה")
        case .languageHelp:
            copy = ("Switch interface language. Your amounts stay unchanged.", "שינוי שפת הממשק בלי לשנות את הסכומים.")
        case .newHand:
            copy = ("New hand", "יד חדשה")
        case .newHandMenu:
            copy = ("New Hand", "יד חדשה")
        case .newHandHelp:
            copy = ("Clear all three inputs and focus the pot. Command-N.", "ניקוי שלושת השדות ומעבר לקופה. \(numericToken("⌘N"))")
        case .keepOnTop:
            copy = ("Keep on top", "מעל חלונות אחרים")
        case .pinned:
            copy = ("Pinned", "נעוץ למעלה")
        case .pinHelp:
            copy = ("Keep this window above normal windows in this Space. Command-Shift-P.", "השארת החלון מעל חלונות רגילים במרחב העבודה הנוכחי. \(numericToken("⌘⇧P"))")
        case .on:
            copy = ("On", "פעיל")
        case .off:
            copy = ("Off", "כבוי")
        case .calculatorMenu:
            copy = ("Calculator", "מחשבון")
        case .focusPot:
            copy = ("Focus Current Pot", "מעבר לקופה הנוכחית")
        case .focusStack:
            copy = ("Focus Effective Stack", "מעבר לסטאק האפקטיבי")
        case .focusFacingBet:
            copy = ("Focus Facing Bet / Raise", "מעבר להימור שמולך")
        case .postflop:
            copy = ("Postflop", "פוסט-פלופ")
        case .preflop:
            copy = ("Preflop", "פרה-פלופ")
        case .pathToAllIn:
            copy = ("Your path to all-in", "הדרך לאול-אין")
        case .currentPot:
            copy = ("Current pot", "הקופה הנוכחית")
        case .effectiveStack:
            copy = ("Effective stack", "סטאק אפקטיבי")
        case .facingBet:
            copy = ("Facing bet / raise", "הימור / העלאה מולך")
        case .potHint:
            copy = ("Before your next bet", "לפני ההימור הבא שלך")
        case .stackHint:
            copy = ("Smaller remaining stack", "הסטאק הקטן שנותר")
        case .facingBetHint:
            copy = ("Their current total size", "סך ההימור הנוכחי של היריב")
        case .sprName:
            copy = ("Stack to pot ratio", "יחס סטאק לקופה")
        case .sprFormula:
            copy = ("Stack ÷ pot", "סטאק חלקי קופה")
        case .validPotAndStack:
            copy = ("Enter a valid pot and effective stack", "יש להזין קופה וסטאק אפקטיבי תקינים")
        case .streets(let count):
            copy = ("\(count) streets", "\(count) סבבים")
        case .streetPercentage(let count):
            copy = ("\(count)-street percentage of pot", "אחוז מהקופה בכל אחד מ-\(count) סבבי ההימורים")
        case .streetPlan(let count):
            copy = ("\(count)-street geometric sizing", "תכנון הימורים באחוז קבוע ל-\(count) סבבים")
        case .potEachStreet:
            copy = ("of pot each street", "מהקופה בכל סבב")
        case .overPot:
            copy = ("of pot · OVER POT", "מהקופה · מעל גודל קופה")
        case .betNow:
            copy = ("BET NOW", "הימור כעת")
        case .bet(let number):
            copy = ("Bet \(number)", "הימור \(number)")
        case .allIn:
            copy = ("All-in", "אול-אין")
        case .afterCalls(let count):
            copy = (
                "After \(count) \(count == 1 ? "call" : "calls")",
                "אחרי השוואה \(count)"
            )
        case .firstBetLabel(let streets):
            copy = ("Your \(streets)e first bet, now", "ההימור הראשון שלך כעת בתכנון \(numericToken("\(streets)e"))")
        case .betCopyLabel(let streets, let number, let allIn):
            copy = (
                "\(streets)e bet \(number)\(allIn ? " all-in" : "")",
                "הימור \(number) בתכנון \(numericToken("\(streets)e"))\(allIn ? ", אול-אין" : "")"
            )
        case .futureBetLabel(let number, let allIn):
            copy = (
                "Your bet \(number)\(allIn ? ", all-in" : ""), after \(number - 1) \(number == 2 ? "call" : "calls")",
                "ההימור ה-\(number) שלך\(allIn ? ", אול-אין" : ""), \(text(.afterCalls(number - 1)))"
            )
        case .waitingForAmounts:
            copy = ("Enter pot + stack. Both plans update instantly.", "יש להזין קופה וסטאק. שני התכנונים מתעדכנים מיד.")
        case .overPotNote:
            copy = ("2e is over pot. Use 3e only if three streets remain.", "\(numericToken("2e")) גדול מהקופה. \(numericToken("3e")) רק אם נותרו שלושה סבבים.")
        case .matchingCallNote:
            copy = ("One matching call each street. Choose the plan for streets remaining.", "היריב משווה בכל סבב. יש לבחור תכנון לפי מספר הסבבים שנותרו.")
        case .roundingNote:
            copy = ("Amounts rounded to 0.1. Final all-in = remaining stack.", "הסכומים מעוגלים לעשירית. האול-אין האחרון הוא הסטאק שנותר.")
        case .raiseTo:
            copy = ("Raise to", "העלאה ל־")
        case .totalTargets:
            copy = ("Total targets, not extra chips to add.", "סכום כולל להעלאה, לא צ׳יפים להוספה.")
        case .inPosition:
            copy = ("In position", "עם עמדה")
        case .outOfPosition:
            copy = ("Out of position", "בלי עמדה")
        case .raiseLabel(let kind):
            let position = kind.positionLabel(in: self)
            copy = (
                "\(kind.title), \(position), total raise to",
                "\(numericToken(kind.title)), \(position), סכום ההעלאה הכולל"
            )
        case .raiseCopyLabel(let kind):
            copy = (
                "\(kind.title) \(kind.positionLabel.lowercased())",
                "\(numericToken(kind.title)), \(kind.positionLabel(in: .hebrew))"
            )
        case .sprReference:
            copy = ("SPR reference", "טבלת SPR")
        case .percentOfPot:
            copy = ("Percent of pot", "אחוז מהקופה")
        case .referenceLabel(let spr, let streets, let percent):
            copy = (
                "SPR \(spr), \(streets) streets, \(percent) of pot",
                "יחס סטאק לקופה \(spr), \(streets) סבבים, \(numericToken(percent)) מהקופה"
            )
        case .unitsNote(let separator):
            copy = (
                "Same units throughout: chips, BB, or currency. Decimal: \(separator)  ·  No grouping.",
                "אותן יחידות: צ׳יפים, בליינדים גדולים או כסף. מפריד עשרוני: \(numericToken(separator)) · בלי מפריד אלפים."
            )
        case .assumptionsNote:
            copy = (
                "Heads-up · one matching call per street · no raises, folds, or rake. Arithmetic, not advice.",
                "מול יריב אחד · השוואה בכל סבב · בלי העלאות, קיפולים או עמלה. חישוב, לא המלצה."
            )
        case .assumptions:
            copy = ("Assumptions", "הנחות החישוב")
        case .assumptionsMenu:
            copy = ("Sizing Assumptions", "הנחות לחישוב ההימורים")
        case .assumptionsHelp:
            copy = ("Read the calculation assumptions and precision details.", "הסבר על הנחות החישוב ועל עיגול הסכומים.")
        case .offline:
            copy = ("OFFLINE", "ללא רשת")
        case .offlineHelp:
            copy = ("Entirely offline. No stored hand data or network connections.", "ללא חיבור לרשת. נתוני היד אינם נשמרים.")
        case .assumptionsTitle:
            copy = ("Sizing, not a recommendation", "חישוב גודל הימור, לא המלצה")
        case .effectiveStackExplanation:
            copy = (
                "Effective stack means the smaller remaining stack. Current pot is the pot before your next bet. Enter both in the same units.",
                "הסטאק האפקטיבי הוא הקטן מבין הסטאקים שנותרו לך וליריב. הקופה הנוכחית היא הקופה לפני ההימור הבא שלך. יש להזין את שניהם באותן יחידות."
            )
        case .geometricExplanation:
            copy = (
                "2e and 3e show your bets at an equal fraction of the growing pot over two or three streets, including the current street. Each matching call adds both bets to the pot. The final bet uses the remaining effective stack, which may be less than your own stack. No intervening raises, folds, or rake are assumed.",
                "\(numericToken("2e")) ו-\(numericToken("3e")) מציגים הימורים באותו אחוז מהקופה הגדלה, בשניים או שלושה סבבים, כולל הסבב הנוכחי. אחרי כל השוואה הקופה כוללת את שני ההימורים. ההימור האחרון הוא עד גובה הסטאק האפקטיבי שנותר, שלא בהכרח שווה לכל הסטאק שלך. החישוב מניח שאין העלאות נוספות, קיפולים או רייק (עמלת קופה)."
            )
        case .planExplanation:
            copy = (
                "Choose only a plan for streets that remain. Over-pot sizes stay visible. Preflop targets are the total bet in that round, including chips already committed, not extra chips to add or stack-aware advice. In/out of position means acting after/before the opponent postflop.",
                "יש לבחור תכנון לפי הסבבים שנותרו. מוצגים גם הימורים גדולים מהקופה. יעדי הפרה-פלופ הם סך ההימור בסבב, כולל מה שכבר הוכנס באותו סבב, ולא תוספת צ׳יפים או המלצה לפי הסטאק. עם עמדה: פועלים אחרי היריב בפוסט-פלופ. בלי עמדה: פועלים לפניו."
            )
        case .roundingExplanation:
            copy = (
                "All results show at most one decimal place, but each street uses unrounded arithmetic. Displayed bets can add up a tenth differently because of rounding; the actual final all-in is your remaining stack. Tiny positive values show a less-than sign instead of zero and cannot be copied.",
                "מוצגת לכל היותר ספרה אחת אחרי הנקודה, אך החישוב בכל סבב אינו מעוגל. סכום ההימורים המוצגים עשוי לסטות בעשירית בגלל העיגול; האול-אין בפועל הוא הסטאק שנותר. ערכים חיוביים זעירים מוצגים עם סימן קטן-מ במקום אפס, ואי אפשר להעתיק אותם כסכום מדויק."
            )
        case .inputRules:
            copy = (
                "Positive input range: 0.001 to 1 trillion. No grouping or exponent notation. Nothing is saved or sent anywhere.",
                "טווח קלט חיובי: \(numericToken("0.001")) עד טריליון. בלי מפריד אלפים או כתיב מדעי. שום נתון אינו נשמר או נשלח."
            )
        case .done:
            copy = ("Done", "סיום")
        case .copyHelp(let label):
            copy = ("Copy \(label) as an amount. Never copies automatically.", "העתקת הסכום: \(label). אין העתקה אוטומטית.")
        case .copyLabel(let label):
            copy = ("Copy \(label)", "העתקת \(label)")
        case .copied(let label, let amount):
            copy = ("Copied \(label): \(amount)", "הועתק \(label): \(numericToken(amount))")
        case .handCleared:
            copy = ("Hand cleared", "היד נוקתה")
        case .noValidAmount:
            copy = ("No valid amount to copy", "אין סכום תקין להעתקה")
        case .copyFailed:
            copy = ("Could not copy. Try again.", "ההעתקה נכשלה. יש לנסות שוב.")
        case .waitingForInput:
            copy = ("Waiting for valid input", "ממתין לקלט תקין")
        case .finishAmount:
            copy = ("Finish entering an amount.", "יש להשלים את הזנת הסכום.")
        case .fieldHelp(let hint, let shortcut):
            copy = (
                "\(hint). Command \(shortcut) to focus and select all.",
                "\(hint). \(numericToken("⌘\(shortcut)")) למעבר לשדה ולבחירת כל הסכום."
            )
        case .fieldError(let message):
            copy = ("Error: \(message)", "שגיאה: \(message)")
        case .potError(let message):
            copy = ("Pot: \(message)", "קופה: \(message)")
        case .stackError(let message):
            copy = ("Effective stack: \(message)", "סטאק אפקטיבי: \(message)")
        case .facingBetError(let message):
            copy = ("Facing bet: \(message)", "הימור מולך: \(message)")
        case .error:
            copy = ("Error", "שגיאה")
        case .outOfRange:
            copy = ("Out of range", "מחוץ לטווח")
        case .formattingFailed:
            copy = ("Formatting failed", "הצגת המספר נכשלה")
        case .invalidDecimalSeparator:
            copy = ("Choose one decimal separator, such as '.' or ','.", "יש לבחור מפריד עשרוני יחיד, למשל נקודה או פסיק.")
        case .amountTooLong(let maximum):
            copy = ("Amount is too long. Use at most \(maximum) characters.", "הסכום ארוך מדי. ניתן להזין עד \(maximum) תווים.")
        case .internalSpaces:
            copy = ("Remove spaces inside the amount.", "יש להסיר רווחים בתוך הסכום.")
        case .exponentNotation:
            copy = ("Use ordinary decimal digits, not exponent notation.", "יש להזין מספר עשרוני רגיל, לא כתיב מדעי.")
        case .multipleSeparators(let separator):
            copy = ("Use only one '\(separator)' decimal separator.", "ניתן להשתמש במפריד עשרוני \(numericToken(separator)) אחד בלבד.")
        case .invalidCharacters(let separator):
            copy = ("Use digits 0–9 and '\(separator)' only; no signs or grouping.", "רק ספרות \(numericToken("0–9")) ו-\(numericToken(separator)); בלי סימנים או מפריד אלפים.")
        case .positiveAmount:
            copy = ("Enter an amount greater than 0.", "יש להזין סכום גדול מאפס.")
        case .minimumAmount(let separator):
            copy = ("Enter at least 0\(separator)001.", "יש להזין לפחות \(numericToken("0\(separator)001")).")
        case .maximumAmount(let maximum):
            copy = ("Enter no more than \(maximum).", "יש להזין לכל היותר \(numericToken(maximum)).")
        case .unrepresentableAmount:
            copy = ("Amount cannot be represented. Enter a smaller ordinary number.", "אי אפשר לייצג את הסכום. יש להזין מספר רגיל קטן יותר.")
        case .unrepresentableTinyAmount(let separator):
            copy = ("Amount is too small to represent. Enter at least 0\(separator)001.", "הסכום קטן מדי. יש להזין לפחות \(numericToken("0\(separator)001")).")
        case .inputRange(let separator, let maximum):
            copy = ("Enter an amount from 0\(separator)001 to \(maximum).", "יש להזין סכום בין \(numericToken("0\(separator)001")) ל-\(numericToken(maximum)).")
        case .mathError(let error):
            switch error {
            case .invalidAmount(let name):
                let hebrewName: String
                switch name {
                case "pot": hebrewName = "קופה"
                case "effective stack": hebrewName = "סטאק אפקטיבי"
                case "facing bet": hebrewName = "הימור מולך"
                case "SPR": hebrewName = "יחס סטאק לקופה"
                default: hebrewName = name
                }
                copy = ("Enter a finite \(name) greater than 0.", "\(hebrewName): נדרש מספר סופי וגדול מאפס.")
            case .invalidStreetCount:
                copy = ("Use at least one remaining street.", "נדרש לפחות סבב הימורים אחד שנותר.")
            case .sprOverflow:
                copy = ("Stack-to-pot ratio is too large to calculate.", "יחס הסטאק לקופה גדול מדי לחישוב.")
            case .sprUnderflow:
                copy = ("Stack-to-pot ratio is too small to calculate.", "יחס הסטאק לקופה קטן מדי לחישוב.")
            case .fractionOverflow:
                copy = ("Bet fraction is too large to represent.", "אחוז ההימור גדול מדי להצגה.")
            case .fractionUnderflow:
                copy = ("Bet fraction is too small to represent. Increase the stack-to-pot ratio.", "אחוז ההימור קטן מדי. יש להגדיל את יחס הסטאק לקופה.")
            case .firstBetOverflow:
                copy = ("First bet is too large to represent. Use smaller amounts.", "ההימור הראשון גדול מדי. יש להזין סכומים קטנים יותר.")
            case .firstBetUnderflow:
                copy = ("First bet is too small to represent. Use larger amounts.", "ההימור הראשון קטן מדי. יש להזין סכומים גדולים יותר.")
            case .insufficientPrecision:
                copy = ("Amounts have too little precision to split safely. Use less extreme amounts.", "הדיוק אינו מספיק לחלוקה בטוחה. יש להזין סכומים פחות קיצוניים.")
            case .raiseOverflow:
                copy = ("Raise amount is too large to represent. Use a smaller facing bet.", "סכום ההעלאה גדול מדי. יש להזין הימור קטן יותר של היריב.")
            }
        }
        return self == .english ? copy.english : copy.hebrew
    }
}

public enum AppText: Sendable {
    case language, languageHelp, newHand, newHandMenu, newHandHelp
    case keepOnTop, pinned, pinHelp, on, off, calculatorMenu
    case focusPot, focusStack, focusFacingBet, postflop, preflop, pathToAllIn
    case currentPot, effectiveStack, facingBet, potHint, stackHint, facingBetHint
    case sprName, sprFormula, validPotAndStack
    case streets(Int), streetPercentage(Int), streetPlan(Int)
    case potEachStreet, overPot, betNow, bet(Int), allIn, afterCalls(Int)
    case firstBetLabel(Int), betCopyLabel(streets: Int, number: Int, allIn: Bool)
    case futureBetLabel(number: Int, allIn: Bool)
    case waitingForAmounts, overPotNote, matchingCallNote, roundingNote
    case raiseTo, totalTargets, inPosition, outOfPosition
    case raiseLabel(RaiseKind), raiseCopyLabel(RaiseKind)
    case sprReference, percentOfPot, referenceLabel(spr: Int, streets: Int, percent: String)
    case unitsNote(String), assumptionsNote, assumptions, assumptionsMenu, assumptionsHelp
    case offline, offlineHelp, assumptionsTitle, effectiveStackExplanation
    case geometricExplanation, planExplanation, roundingExplanation, inputRules, done
    case copyHelp(String), copyLabel(String), copied(label: String, amount: String)
    case handCleared, noValidAmount, copyFailed, waitingForInput, finishAmount
    case fieldHelp(hint: String, shortcut: String), fieldError(String)
    case potError(String), stackError(String), facingBetError(String)
    case error, outOfRange, formattingFailed, invalidDecimalSeparator
    case amountTooLong(Int), internalSpaces, exponentNotation
    case multipleSeparators(String), invalidCharacters(String), positiveAmount
    case minimumAmount(String), maximumAmount(String), unrepresentableAmount
    case unrepresentableTinyAmount(String), inputRange(separator: String, maximum: String)
    case mathError(PokerMathError)
}
