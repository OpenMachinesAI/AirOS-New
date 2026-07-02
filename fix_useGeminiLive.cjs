const fs = require('fs');
let text = fs.readFileSync('hooks/useGeminiLive.ts', 'utf8');

text = text.replace(/                          else if \(fc\.name === 'start_face_onboarding'\) \{/g,
`                          else if (fc.name === 'recognize_face') {
                              try {
                                  const familyMembers = JSON.parse(localStorage.getItem('airo_family_members') || '[]');
                                  if (familyMembers.length === 0) {
                                      result = { error: "No family members or friends are saved yet. The user needs to add someone first." };
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
                                              result = { result: \`Identified people: \${data.names.join(', ')}\` };
                                          } else {
                                              result = { result: "Could not identify any known faces in the camera frame." };
                                          }
                                      } else {
                                          result = { error: "Camera frame capture failed. Ensure the camera is active." };
                                      }
                                  }
                              } catch (e: any) {
                                  result = { error: \`Face recognition failed: \${e.message}\` };
                              }
                          }
                          else if (fc.name === 'start_face_onboarding') {`);

fs.writeFileSync('hooks/useGeminiLive.ts', text);
