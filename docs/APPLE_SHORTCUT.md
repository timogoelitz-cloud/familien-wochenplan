# Einkaufsliste an Apple Erinnerungen übergeben

## Warum ein Kurzbefehl?

Eine Web-App kann Apple Erinnerungen **nicht direkt** befüllen. Es gibt dafür keine Schnittstelle im
Browser – weder in Safari auf dem iPad noch sonst wo. Wer etwas anderes behauptet, erfindet eine API.

Was funktioniert: Die App bereitet die Liste in genau dem Format auf, das ein **Apple Kurzbefehl**
(Shortcuts) weiterverarbeiten kann, und legt sie in die Zwischenablage. Der Kurzbefehl erzeugt daraus
die Einträge. Das ist ein zusätzlicher Tipp, dafür läuft es zuverlässig und ohne Konto.

## Das Format

Beim Tippen auf **„In Apple Erinnerungen“** landet eine Zeile je Artikel in der Zwischenablage:

```
Spaghetti – 800 g (2 × 500 g) [Kück Biomarkt]
Passierte Tomaten – 2 Glas [ALDI]
Zwiebeln – 3 Stk [Unklar]
```

Eine Zeile = eine Erinnerung. Der Händler steht in eckigen Klammern am Ende.

## Kurzbefehl einrichten (einmalig, ca. 3 Minuten)

Auf dem iPad in der App **Kurzbefehle**:

1. **+** oben rechts → neuer Kurzbefehl.
2. Aktion **„Aus Zwischenablage abrufen“** hinzufügen.
3. Aktion **„Text teilen“** hinzufügen.
   Als Trennzeichen **„Neue Zeilen“** wählen. Ergebnis ist eine Liste von Zeilen.
4. Aktion **„Jedes Objekt wiederholen“** hinzufügen.
   Als Eingabe das Ergebnis aus Schritt 3 wählen.
5. **Innerhalb** der Wiederholung die Aktion **„Erinnerung hinzufügen“** einsetzen:
   - *Titel:* die Variable **„Wiederholungsobjekt“**
   - *Liste:* **Einkaufen**
6. Oben den Namen vergeben: **Einkaufsliste übernehmen**
   (derselbe Name, der in der App unter *Einstellungen → Name des Apple-Kurzbefehls* steht).
7. Sichern.

**Praktisch:** Im Kurzbefehl unter *Details* die Option **„Zum Home-Bildschirm“** wählen. Dann liegt
er als Symbol neben der Wochenplan-App.

## Ablauf im Alltag

1. In der App: **Einkaufsliste → In Apple Erinnerungen**.
   (Liste ist jetzt in der Zwischenablage; eine Meldung bestätigt das.)
2. Kurzbefehl **Einkaufsliste übernehmen** starten.
3. Fertig – die Einträge stehen in der Liste **Einkaufen**.

Beim ersten Lauf fragt iOS nach der Erlaubnis für Erinnerungen und Zwischenablage. Beides bestätigen.

## Anpassungen

- **Andere Liste:** In der App unter *Einstellungen → Liste in Apple Erinnerungen* ändern und im
  Kurzbefehl die Liste in Schritt 5 entsprechend umstellen. (Die App kann den Kurzbefehl nicht selbst
  umkonfigurieren – der Name dort ist nur eine Gedächtnisstütze.)
- **Händler weglassen:** Im Kurzbefehl vor „Erinnerung hinzufügen“ eine Aktion **„Text ersetzen“**
  mit regulärem Ausdruck ` \[.*\]$` und leerem Ersetzungstext einfügen.
- **Nur offene Posten:** Bereits abgehakte Artikel stehen weiterhin mit in der Liste. Wer das nicht
  will, hakt erst nach der Übergabe ab.

## Warum nicht automatisch?

Ein Kurzbefehl kann per `shortcuts://run-shortcut?name=…&input=text` auch direkt aus einer Web-App
gestartet werden. Das ist hier bewusst **nicht** eingebaut: Safari begrenzt die Länge solcher URLs,
und eine längere Einkaufsliste würde abgeschnitten – ohne Warnung, mitten im Text. Ein stillschweigend
unvollständiger Einkaufszettel ist schlimmer als ein zusätzlicher Tipp. Der Weg über die
Zwischenablage hat diese Grenze nicht.

Sollte sich das ändern, wäre nur `handleReminders` in
[`src/ui/views/ShoppingListView.tsx`](../src/ui/views/ShoppingListView.tsx) anzupassen – das
Textformat in `shoppingListAsReminderLines` bliebe unverändert.
