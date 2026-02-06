# Handoff Procedure

## Trigger Thresholds
- < 75%: normal work
- 75-92%: avoid new large tasks
- >= 93%: handoff immediately

## Handoff Steps (short)
1) Confirm quota threshold is reached.
2) Write a handoff summary (see assets/handoff-template.md).
3) Message the next orchestrator with the file path.
4) Verify they are active (tmux capture-pane).

## Handoff Message Template

```bash
tmux send-keys -t $SESSION:1 "HANDOFF: You are the new orchestrator. Read <handoff_file> and CLAUDE.md, then resume." Enter
```

## Verification

```bash
sleep 5
tmux capture-pane -t $SESSION:1 -p | tail -15
```

