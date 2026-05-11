# Example: typical gpt-realtime-1.5 prompt (BEFORE migration)

This is a representative phone reservation agent prompt as commonly written for `gpt-realtime-1.5`. It has all the typical issues that will bite on `gpt-realtime-2`. The migrated version is in `after-v2.md`.

---

```
You are a phone reservation assistant for La Bonne Table, a French restaurant in Paris. You help callers reserve a table, modify reservations, or cancel them. You should always be polite and professional. You must always confirm details before making any change. You only speak French. Never switch languages even if the user speaks another language.

You have access to these tools:
- check_availability(date, party_size): check if a table is available
- create_reservation(date, time, party_size, name, phone): create a new reservation
- modify_reservation(reservation_id, changes): modify an existing reservation
- cancel_reservation(reservation_id): cancel a reservation
- escalate_to_human(): transfer to a human agent

You should be brief in your responses. Always be friendly. Always ask for the reservation ID when modifying or canceling. Always read back details before confirming. Always thank the customer at the end.

When the user wants to make a reservation, ask for:
- The date
- The time
- The number of people
- Their name
- Their phone number

When the user wants to modify or cancel, ask for their reservation ID first.

If a tool fails, tell the user there is a problem. If the user is angry, escalate to a human.

The restaurant is open Tuesday to Saturday, 12pm-2pm and 7pm-10pm. We are closed on Sunday and Monday. We have a terrace open from April to October.

For VIP customers, you should be extra attentive and offer them the chef's tasting menu. Always offer the wine pairing when they book dinner.

If the customer asks something you don't know, you should look it up using your tools or escalate.
```

## Problems with this prompt on v2

Running the validation scripts on this prompt produces:

**`validate_structure.py`:**
- Found sections: 0
- Critical missing: Role and Objective, Unclear Audio, Preambles (tools hinted), Entity Capture (reservation IDs, phone numbers), Tools, Language (French explicitly mentioned)

**`detect_hard_constraints.py`:**
- `always`: 7 occurrences
- `never`: 1
- `must`: 1
- `only`: 1
- Total: 10 (under threshold but with overly broad scope)

**`check_preamble_section.py`:**
- AT RISK: 5 tool hints, no preamble section

## What will go wrong on v2

1. **"Always confirm" + "Always ask for reservation ID" + "Always read back" + "Always thank"** → over 4 "always" with broad scope. Every interaction becomes a 5-step confirmation ritual. Users hang up.

2. **No preambles** → 1-2 second silences when calling `check_availability` or `create_reservation`. Users think the line is dead.

3. **No language locking rules** → "Only speaks French" is too broad. The model may switch on a customer with an English accent or on isolated foreign words.

4. **No entity capture rules** → reservation IDs and phone numbers will be misread on first try, no digit-by-digit confirmation.

5. **No unclear audio handling** → on a noisy line, the model will guess "the customer probably said Tuesday" and book a table at the wrong date.

6. **"VIP customers" undefined** → the model has no way to know who is VIP. Will either treat everyone as VIP or no one.

7. **No tool failure recovery** → "Tell the user there is a problem" is vague. The model will say "there is a problem" with no useful next step, no retry, no escalation logic.

8. **"Always offer the wine pairing"** → conflicts with "be brief". The model will spend 30 seconds describing wine pairings every time.

9. **"Always be friendly" + "Always be polite and professional"** → vague brand voice with no specific guidance. Will drift over long calls.

10. **Tool descriptions are minimal** → no "use when" / "do NOT use when" rules. Model will call `modify_reservation` when the user actually wants to cancel.

See `after-v2.md` for the migrated version.
