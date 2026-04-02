# AirSkill Authoring Spec For LLMs

Use this document when an LLM is asked to design a skill for Airo.

Your job is to output a valid `.airskill` JSON package that the Airo desktop builder can import and that the runtime can execute.

## Output Contract

Always return a single JSON object.

Do not include:

- markdown fences
- commentary before or after the JSON
- pseudo-code
- explanations

Return only valid JSON.

## Required Top-Level Shape

```json
{
  "format": "airskill",
  "version": "2.0.0",
  "exportedAt": "2026-03-24T20:00:00.000Z",
  "skill": {
    "id": "skill-example",
    "name": "Example Skill",
    "description": "What the skill does.",
    "trigger": "voice",
    "workspaceState": null
  },
  "script": {
    "language": "airscript-1",
    "entry": []
  }
}
```

## Required Rules

1. `format` must be `"airskill"`.
2. `version` must be `"2.0.0"`.
3. `script.language` must be `"airscript-1"`.
4. `script.entry` must be an array of step objects.
5. `skill.trigger` must be one of:
   - `"voice"`
   - `"menu"`
   - `"face"`
   - `"photo"`
6. `workspaceState` can be `null` if you are generating script-only content.
7. Keep IDs lowercase and hyphenated, for example: `"skill-photo-demo"`.

## Preferred Authoring Style

- Build one focused skill at a time.
- Use short spoken lines.
- Use `say_random` when a line should feel less repetitive.
- Set a status line before long actions.
- Use direct actions instead of `call_function` whenever possible.
- For conversation-like skills, use one shared TTS path through `say` and `say_random`.
- If a skill should orient toward a person, include `face_person`.
- Use `show_number_widget` for countdowns, scores, and other large numeric moments.
- Use `play_tone` for countdown beeps, confirms, cancels, and success sounds so skills share the same audio style.

## Supported Value Types

Most fields accept:

- string
- number
- boolean
- null
- `{ "var": "variableName" }`
- `{ "random": ["choice one", "choice two"] }`

## Supported Actions

### 1. Speak one line

```json
{ "action": "say", "text": "Hello there." }
```

### 2. Speak a random line

```json
{ "action": "say_random", "lines": ["Hello there.", "Hi, I am ready.", "Okay, let us do it."] }
```

### 3. Set the robot status text

```json
{ "action": "set_status", "text": "Scanning room" }
```

### 4. Display text on screen

```json
{ "action": "display_text", "title": "Skill Title", "body": "Skill body text." }
```

### 5. Display an image

```json
{ "action": "display_image", "url": "https://example.com/pic.png", "caption": "Preview" }
```

### 6. Show an Airo-style UI card

```json
{
  "action": "show_ui_card",
  "title": "Photo Preview",
  "subtitle": "Here is the shot I took",
  "body": "Say yes to keep it or no to discard it.",
  "theme": "photo",
  "imageUrl": { "var": "lastPhoto" },
  "chipsJson": "[\"photo\",\"preview\"]"
}
```

Allowed themes:

- `info`
- `success`
- `warning`
- `danger`
- `photo`

### 7. Set eye preset

```json
{ "action": "set_eyes", "preset": "thinking", "durationMs": 1200 }
```

Allowed presets:

- `idle`
- `connecting`
- `listening`
- `speaking`
- `thinking`
- `muted`

### 8. Set dock lights

```json
{ "action": "set_lights", "red": 0, "green": 180, "blue": 255, "durationMs": 1200 }
```

### 9. Move the robot

```json
{ "action": "move", "direction": "left", "intensity": 0.55 }
```

Allowed directions:

- `front`
- `behind`
- `left`
- `right`

### 10. Move the robot for a duration

```json
{ "action": "move_timed", "direction": "front", "intensity": 0.75, "durationMs": 650 }
```

### 11. Turn to a waypoint

```json
{ "action": "turn_waypoint", "direction": "behind" }
```

Allowed waypoint directions:

- `front`
- `behind`
- `left`
- `right`

### 12. Rotate by degrees

```json
{ "action": "rotate_robot", "degrees": 180 }
```

### 13. Turn toward a person

```json
{ "action": "face_person" }
```

Use this when the skill should orient toward the visible user before speaking or taking a photo.

### 14. Stop robot motion

```json
{ "action": "stop_robot" }
```

### 15. Take a photo

```json
{ "action": "take_photo", "saveAs": "lastPhoto" }
```

### 16. Save an image to gallery

```json
{ "action": "save_image_to_gallery", "image": { "var": "lastPhoto" }, "source": "front", "saveAs": "savedPhotoId", "onlyIfTrueVar": "saveChoice" }
```

Use this when you want explicit save behavior. This prevents auto-saving when the user says no.

`onlyIfTrueVar` is optional. If set, gallery save runs only when that variable is exactly `true`.

### 17. Recognize a face

```json
{ "action": "recognize_face", "target": "family", "saveAs": "faceName" }
```

Allowed targets:

- `family`
- `any-face`

### 18. Show timer widget

```json
{ "action": "show_timer_widget", "durationSeconds": 30, "title": "Countdown" }
```

### 19. Show confirmation widget

```json
{ "action": "show_confirmation_widget", "title": "Save this?", "subtitle": "Say yes or no.", "confirmText": "Yes", "cancelText": "No", "saveAs": "saveChoice" }
```

This widget waits for a spoken or tapped answer. If `saveAs` is present, the answer is always stored as a boolean: `true` for confirm, `false` for cancel or timeout.

### 20. Show a standard number widget

```json
{ "action": "show_number_widget", "value": 3, "title": "Countdown", "subtitle": "Photo starts in", "durationMs": 900 }
```

### 21. Show settings widget

```json
{ "action": "show_settings_widget", "title": "Modes", "optionsJson": "[{\"id\":\"one\",\"label\":\"One\",\"icon\":\"⭐\"}]" }
```

### 22. Play a sound clip

```json
{ "action": "play_sound", "sound": "success", "volume": 0.6 }
```

Available built-in sound keys:

- `alarm`
- `closeMenu`
- `fail`
- `notify`
- `openMenu`
- `photoTaken`
- `processing`
- `readyForSpeech`
- `success`
- `timer`
- `unknownCommand`

Use this for the shared Airo sound set stored in `/audio/ost/...`.

### 23. Listen for a voice command

```json
{ "action": "listen_voice_command", "saveAs": "heardText", "timeoutMs": 9000, "interim": false }
```

Stores captured speech transcript in `saveAs`.  
If no transcript is captured before timeout, an empty string is returned.  
Set `interim` to `true` to allow interim speech results.

### 24. Play a standard tone

### 25. Wait

```json
{ "action": "wait", "durationMs": 600 }
```

Use `wait_for` in the block editor as the friendly label for the same action.

```json
{ "action": "play_tone", "tone": "countdown" }
```

Named tone presets:

- `countdown`
- `confirm`
- `cancel`
- `success`
- `error`

You can also override the sound directly:

```json
{ "action": "play_tone", "frequencyHz": 880, "durationMs": 180, "volume": 0.08, "waveform": "sine" }
```

### 23. Save a variable

```json
{ "action": "set_var", "name": "mood", "value": "happy" }
```

### 24. Pick a random variable value

```json
{ "action": "choose_random", "name": "line", "values": ["One", "Two", "Three"] }
```

### 25. Wait

```json
{ "action": "wait", "durationMs": 600 }
```

### 26. Call a function only if there is no direct action

```json
{ "action": "call_function", "name": "show_timer_widget", "payloadJson": "{\"title\":\"Timer\"}" }
```

Prefer a direct action instead of `call_function` whenever one exists.

## Variables

Variables are useful when:

- storing a recognized face name
- storing the result of a photo step
- storing the result of a confirmation widget
- selecting a random line first and speaking it later

Example:

```json
{
  "action": "choose_random",
  "name": "introLine",
  "values": [
    "Okay, camera time.",
    "Hold still, I am lining up the shot.",
    "Let me get a good angle."
  ]
}
```

Then:

```json
{ "action": "say", "text": { "var": "introLine" } }
```

## Recommended Skill Patterns

### Photo skill

Use:

1. `say_random`
2. `face_person`
3. `set_status`
4. `show_number_widget`
5. `play_tone`
6. `take_photo`
7. `show_confirmation_widget`

### Standard countdown pattern

Use this when you want the Airo UI and sound style to match other skills:

1. `show_number_widget`
2. `play_tone`
3. `say`
4. `wait`

Example:

```json
[
  { "action": "show_number_widget", "value": 3, "title": "Countdown", "subtitle": "Get ready", "durationMs": 900 },
  { "action": "play_tone", "tone": "countdown" },
  { "action": "say", "text": "Three." },
  { "action": "wait", "durationMs": 1000 },
  { "action": "show_number_widget", "value": 2, "title": "Countdown", "subtitle": "Get ready", "durationMs": 900 },
  { "action": "play_tone", "tone": "countdown" },
  { "action": "say", "text": "Two." },
  { "action": "wait", "durationMs": 1000 },
  { "action": "show_number_widget", "value": 1, "title": "Countdown", "subtitle": "Smile", "durationMs": 900 },
  { "action": "play_tone", "tone": "countdown" },
  { "action": "say", "text": "One." },
  { "action": "wait", "durationMs": 1000 }
]
```

### Greeting skill

Use:

1. `face_person`
2. `set_eyes`
3. `say_random`
4. `set_lights`

### News or info skill shell

If the skill is only presenting prepared information:

1. `set_status`
2. `display_text`
3. `say`

## Example Good Output

```json
{
  "format": "airskill",
  "version": "2.0.0",
  "exportedAt": "2026-03-24T20:00:00.000Z",
  "skill": {
    "id": "skill-friendly-photo",
    "name": "Friendly Photo",
    "description": "Faces the user, says a fun line, and takes a photo.",
    "trigger": "voice",
    "workspaceState": null
  },
  "script": {
    "language": "airscript-1",
    "entry": [
      {
        "action": "say_random",
        "lines": [
          "Okay, camera time.",
          "Hold still, I am lining up the shot.",
          "Let me get a nice photo of you."
        ]
      },
      { "action": "face_person" },
      { "action": "set_status", "text": "Taking a photo" },
      { "action": "set_eyes", "preset": "thinking", "durationMs": 900 },
      { "action": "take_photo", "saveAs": "lastPhoto" },
      { "action": "say", "text": "Photo flow complete." }
    ]
  }
}
```

## Invalid Output Examples

Do not do these:

- return JavaScript instead of JSON
- wrap JSON in markdown fences
- invent unsupported actions
- put comments inside JSON
- use triggers outside the allowed set
- omit `script.language`

## Builder Import

The desktop builder now has an import text box.

You can paste:

- a full `.airskill` JSON package

The builder will read:

- `skill.id`
- `skill.name`
- `skill.description`
- `skill.trigger`
- `skill.workspaceState`

If `workspaceState` is `null`, the skill can still be stored and executed through the scripted runtime.
