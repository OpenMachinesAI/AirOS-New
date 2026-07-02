const fs = require('fs');
let text = fs.readFileSync('App.tsx', 'utf8');

text = text.replace(/          else if \(name === 'start_face_onboarding'\) \{/g,
`          else if (name === 'recognize_face') {
              try {
                  const familyMembers = JSON.parse(localStorage.getItem('airo_family_members') || '[]');
                  if (familyMembers.length === 0) {
                      return JSON.stringify({ error: "No family members or friends are saved yet." });
                  } else {
                      const frame = await captureCameraFrame();
                      if (frame) {
                          const response = await fetch('/api/recognize-face', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ currentFrame: frame, familyMembers })
                          });
                          const data = await response.json();
                          if (data.names && data.names.length > 0) {
                              return JSON.stringify({ result: \`Identified people: \${data.names.join(', ')}\` });
                          } else {
                              return JSON.stringify({ result: "Could not identify any known faces in the camera frame." });
                          }
                      } else {
                          return JSON.stringify({ error: "Camera frame capture failed." });
                      }
                  }
              } catch (e: any) {
                  return JSON.stringify({ error: \`Face recognition failed: \${e.message}\` });
              }
          }
          else if (name === 'start_face_onboarding') {`);

fs.writeFileSync('App.tsx', text);
