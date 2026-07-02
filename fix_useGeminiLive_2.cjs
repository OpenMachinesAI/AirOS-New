const fs = require('fs');
let text = fs.readFileSync('hooks/useGeminiLive.ts', 'utf8');

text = text.replace(/                                          if \(data\.names && data\.names\.length > 0\) \{[^}]+\} else \{/g,
`                                          if (data.names && data.names.length > 0) {
                                              const recognizedName = data.names[0];
                                              const member = familyMembers.find((m: any) => m.name === recognizedName);
                                              if (member && member.image) {
                                                  setVisualContent({ 
                                                      type: 'predefined', 
                                                      component: 'confirmation', 
                                                      content: { 
                                                          title: \`Are you \${recognizedName}?\`, 
                                                          subtitle: "Face Recognition", 
                                                          confirmText: "Yes", 
                                                          cancelText: "No", 
                                                          imageUrl: member.image 
                                                      }, 
                                                      title: 'CONFIRM' 
                                                  });
                                              }
                                              result = { result: \`Identified people: \${data.names.join(', ')}. I am showing their face on the screen and asking if I was right.\` };
                                          } else {`);

fs.writeFileSync('hooks/useGeminiLive.ts', text);
