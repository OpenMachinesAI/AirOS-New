const fs = require('fs');
let text = fs.readFileSync('App.tsx', 'utf8');

const targetStr = `                          if (data.names && data.names.length > 0) {
                              return JSON.stringify({ result: \`Identified people: \${data.names.join(', ')}\` });
                          } else {`;
const replaceStr = `                          if (data.names && data.names.length > 0) {
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
                              return JSON.stringify({ result: \`Identified people: \${data.names.join(', ')}. I am showing their face on the screen and asking if I was right.\` });
                          } else {`;

text = text.replace(targetStr, replaceStr);

fs.writeFileSync('App.tsx', text);
