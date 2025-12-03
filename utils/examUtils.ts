import { ExamData, Section, Question, QuestionType, Option } from '../types';

/**
 * PARSING LOGIC
 */
export const parseExamText = (text: string): ExamData => {
  const sections: Section[] = [];
  
  // Cleanup: Split "rude.A." -> "rude.\nA." and "rude. A." -> "rude.\nA."
  // Also handles cases where option letter is followed by paren like "A)"
  let cleanText = text.replace(/([a-z0-9])\.\s*([A-D][\.\)])/g, '$1.\n$2');
  
  const lines = cleanText.split('\n');
  
  let currentSection: Section | null = null;
  let currentQuestion: Question | null = null;
  let inPassage = false;
  let passageBuffer: string[] = [];
  const answerKeyMap = new Map<number, string>(); 

  // Helper to save current question
  const finalizeQuestion = () => {
    if (currentQuestion) {
      if (currentSection) {
        currentSection.questions.push(currentQuestion);
      }
      currentQuestion = null;
    }
  };

  // Helper to detect section type based on content
  const detectType = (section: Section): QuestionType => {
    if (section.id.startsWith('sec-ai-')) return section.type;

    const combinedContent = (section.header || "") + (section.passage || "");
    const qContent = section.questions.map(q => q.content).join(" ");
    
    // Cloze detection
    if (/\(\d+\)/.test(combinedContent) || /Gap \d+/i.test(qContent)) return QuestionType.CLOZE;
    
    // Reading detection
    if (section.passage && section.questions.length >= 1) return QuestionType.READING;
    
    return QuestionType.DISCRETE;
  };

  // Helper to start a new section
  const startNewSection = (headerLine: string = "", forceType?: QuestionType) => {
    finalizeQuestion();
    
    if (currentSection) {
       currentSection.type = forceType || detectType(currentSection);
       if (currentSection.questions.length > 0 || currentSection.passage) {
           sections.push(currentSection);
       }
    }

    currentSection = {
      id: `sec-${Date.now()}-${Math.random()}`,
      type: forceType || QuestionType.DISCRETE,
      questions: [],
      header: headerLine,
      passage: ''
    };
  };

  // Regex helpers
  const sectionTagRegex = /^\[SECTION:\s*(.*)\]/i;
  const passageStartRegex = /^\[PASSAGE_START\]/i;
  const passageEndRegex = /^\[PASSAGE_END\]/i;
  
  const questionRegex = /^(?:Question|Câu|Q)\s*(\d+)[\.:]\s*(.*)/i;
  const strictNumberRegex = /^(\d+)[\.:]\s+(.*)/; 
  
  // STRICT UPPERCASE OPTION REGEX
  const optionRegex = /^([A-D])[\.\)]\s+(.*)/;
  
  const answerInlineRegex = /^(?:Answer|Đáp án|Key).*?([A-D])/i; 
  // Expanded Instruction Regex to catch "Mark the letter..."
  const instructionRegex = /^(Mark the letter|Read the following|Choose the|Circle the|Đọc đoạn văn|Chọn đáp án|Bài tập|Indicate the word)/i;

  // 1. PRE-PASS: Extract Answer Key Table
  let contentLines = lines;
  let answerKeyStartIndex = -1;
  
  for(let i = lines.length - 1; i >= 0; i--) {
     const line = lines[i].trim();
     if (/^(?:Answer Key|Đáp án|KEY|ĐÁP ÁN)(?:.*Code.*)?$/i.test(line)) {
        answerKeyStartIndex = i;
        break;
     }
  }

  if (answerKeyStartIndex !== -1) {
    const keyLines = lines.slice(answerKeyStartIndex + 1);
    contentLines = lines.slice(0, answerKeyStartIndex); 
    const keyText = keyLines.join(" ");
    const keyMatches = keyText.matchAll(/(\d+)[\.\s:-]*([A-D])/gi);
    for (const m of keyMatches) {
        answerKeyMap.set(parseInt(m[1]), m[2].toUpperCase());
    }
  }

  // 2. MAIN PASS
  startNewSection(""); 

  for (let i = 0; i < contentLines.length; i++) {
    let line = contentLines[i].trim();
    if (!line) continue;

    // Detect and extract {{ANS:X}} marker injected by File Reader
    const markerMatch = line.match(/{{ANS:([A-D])}}/i);
    let markedAnswer: string | null = null;
    if (markerMatch) {
        markedAnswer = markerMatch[1].toUpperCase();
        // Remove marker from text to keep it clean
        line = line.replace(/{{ANS:[A-D]}}/gi, '').trim();
    }

    // A. Explicit Section Tag
    const sectionMatch = line.match(sectionTagRegex);
    if (sectionMatch) {
      const typeStr = sectionMatch[1].toUpperCase();
      let type = QuestionType.DISCRETE;
      if (typeStr.includes('CLOZE')) type = QuestionType.CLOZE;
      if (typeStr.includes('READING')) type = QuestionType.READING;
      
      startNewSection("", type);
      if (currentSection) currentSection.id = `sec-ai-${Date.now()}`; 
      continue;
    }

    // B. Passage Tags
    if (line.match(passageStartRegex)) {
      finalizeQuestion();
      inPassage = true;
      continue;
    }
    if (line.match(passageEndRegex)) {
      inPassage = false;
      if (currentSection) currentSection.passage = passageBuffer.join('\n');
      passageBuffer = [];
      continue;
    }
    if (inPassage) {
      passageBuffer.push(line);
      continue;
    }

    // C. Instruction Detection (Strict)
    // If we hit an instruction, force a new section if the previous one has content
    // OR if we are currently parsing a question (this implies the question is done)
    if (instructionRegex.test(line)) {
       if (currentSection && (currentSection.questions.length > 0 || currentSection.passage || currentQuestion)) {
          startNewSection(line);
          continue;
       } else if (currentSection && !currentSection.header) {
          currentSection.header = line;
          continue;
       }
    }

    // D. Question Detection
    let qMatch = line.match(questionRegex);
    if (!qMatch) qMatch = line.match(strictNumberRegex);

    if (qMatch) {
      finalizeQuestion();
      
      if (inPassage) { 
          inPassage = false;
          if (currentSection) currentSection.passage = passageBuffer.join('\n');
          passageBuffer = [];
      }

      currentQuestion = {
        id: `q-${Date.now()}-${i}`,
        number: parseInt(qMatch[1], 10),
        originalNumber: parseInt(qMatch[1], 10),
        content: qMatch[2],
        options: [],
        answer: null
      };
      
      if (markedAnswer) currentQuestion.answer = markedAnswer;
      continue;
    }

    // E. Option Detection
    const optMatch = line.match(optionRegex);
    if (optMatch && currentQuestion) {
      currentQuestion.options.push({
        label: optMatch[1].toUpperCase(),
        content: optMatch[2]
      });
      if (markedAnswer) {
          currentQuestion.answer = markedAnswer;
      }
      continue;
    }

    // F. Answer Inline Detection
    const ansMatch = line.match(answerInlineRegex);
    if (ansMatch && currentQuestion) {
      currentQuestion.answer = ansMatch[1].toUpperCase();
      continue;
    }
    
    // G. Header/Passage accumulation / Multiline content
    if (currentSection) {
        if (currentQuestion) {
            // Check for list item pattern (a. b. c. 1. 2. - )
            // If it looks like a list item (e.g. "a."), add a line break to format nicely in HTML
            const isListItem = /^(?:[a-z]\.|[0-9]{1,2}\.|-)\s/.test(line);
            if (isListItem) {
                currentQuestion.content += `<br/>${line}`;
            } else {
                currentQuestion.content += " " + line;
            }
        } else {
            if (line.length > 150) {
                currentSection.passage = (currentSection.passage ? currentSection.passage + "\n" : "") + line;
            } else {
                if (!currentSection.passage) {
                    currentSection.header = (currentSection.header ? currentSection.header + "\n" : "") + line;
                } else {
                    currentSection.passage += "\n" + line;
                }
            }
        }
    }
  }

  finalizeQuestion();
  if (currentSection) {
      currentSection.type = detectType(currentSection);
      if (currentSection.questions.length > 0) sections.push(currentSection);
  }

  // 3. POST-PASS: Apply Answer Key Map
  sections.forEach(sec => {
    sec.questions.forEach(q => {
        if (!q.answer && answerKeyMap.has(q.originalNumber)) {
            q.answer = answerKeyMap.get(q.originalNumber) || null;
        }
    });
  });

  return {
    title: "Exam",
    sections
  };
};

/**
 * SHUFFLING LOGIC
 */

function shuffleArray<T>(array: T[]): T[] {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export const shuffleExam = (data: ExamData): ExamData => {
  const shuffledSections = shuffleArray(data.sections);
  let globalQuestionCounter = 1;

  const processedSections = shuffledSections.map(section => {
    const newSection = { 
        ...section, 
        questions: section.questions.map(q => ({
            ...q,
            options: q.options.map(o => ({...o}))
        })) 
    };
    
    const sectionStartNum = globalQuestionCounter;
    const isCloze = newSection.type === QuestionType.CLOZE;

    // Shuffle questions if not Cloze
    if (!isCloze) {
        newSection.questions = shuffleArray(newSection.questions);
    }

    const oldToNewGapMap = new Map<number, number>();

    newSection.questions.forEach(q => {
      const newNum = globalQuestionCounter++;
      oldToNewGapMap.set(q.originalNumber, newNum); 

      // Always shuffle options
      const shuffledOptions = shuffleArray(q.options);
      
      const correctContent = q.answer ? q.options.find(o => o.label === q.answer)?.content : null;
      
      shuffledOptions.forEach((opt, idx) => {
        opt.label = String.fromCharCode(65 + idx);
      });

      let newAnswer = null;
      if (correctContent) {
         newAnswer = shuffledOptions.find(o => o.content === correctContent)?.label || null;
      }

      q.options = shuffledOptions;
      q.answer = newAnswer;
      q.number = newNum;

      // STRICTLY CLEAN "GAP" TEXT
      // Removes "Gap 1.", "Gap 1:", "1.", "(1)" from the START or END of the question text
      // We run this loop to ensure multiple prefixes (e.g. "Question 1. Gap 1.") are all stripped
      let content = q.content;
      let prevContent = "";
      while (content !== prevContent) {
          prevContent = content;
          content = content.replace(/^(?:Question\s*\d+[\.:]?|Gap\s*\d+[\.:]?|Câu\s*\d+[\.:]?|\(\d+\))[\s]*/gi, ''); 
      }
      content = content.replace(/[\s]*(?:Gap\s*\d+[\.:]?)$/gi, '');
      
      q.content = content.trim(); 
    });

    if (isCloze && newSection.passage) {
        let text = newSection.passage;
        oldToNewGapMap.forEach((newVal, oldVal) => {
             // Replace (1) with temporary token to avoid re-replacing
             const gapRegex = new RegExp(`\\(${oldVal}\\)`, 'g');
             text = text.replace(gapRegex, `{{GAP_TOKEN_${newVal}}}`);
        });
        // Restore tokens to (1)
        text = text.replace(/{{GAP_TOKEN_(\d+)}}/g, '($1)');
        newSection.passage = text;
    }

    // Update range in header "Questions 1 to 5"
    if (newSection.header) {
      const start = sectionStartNum;
      const end = globalQuestionCounter - 1;
      newSection.header = newSection.header.replace(/(\b\d+\b)(\s*(?:to|-|–|đến)\s*)(\b\d+\b)/gi, (match, p1, sep, p2) => {
           return `${start}${sep}${end}`;
      });
    }

    return newSection;
  });

  return {
    ...data,
    sections: processedSections
  };
};

/**
 * EXPORT LOGIC
 */

export const generateWordHtml = (exam: { data: ExamData; code: string }): string => {
  let examContent = "";
  
  // Title
  examContent += `<h2 style='text-align: center; text-transform: uppercase;'>MÃ ĐỀ: ${exam.code}</h2>`;

  const allQuestions: {number: number, answer: string}[] = [];

  exam.data.sections.forEach(section => {
    if (section.header) {
        // Render header bold
        examContent += `<div style='font-weight:bold; margin-top: 15px; margin-bottom: 5px;'>${section.header.replace(/\n/g, '<br/>')}</div>`;
    }
    
    if (section.passage) {
        examContent += `<div style='background: #f9f9f9; padding: 10px; border: 1px dashed #ccc; margin-bottom: 10px; font-style: italic;'>${section.passage.replace(/\n/g, '<br/>')}</div>`;
    }

    section.questions.forEach(q => {
      allQuestions.push({ number: q.number, answer: q.answer || "" });
      
      const content = q.content ? q.content : "";
      examContent += `<p style='margin-bottom: 5px;'><strong>Question ${q.number}.</strong> ${content}</p>`;
      
      // Options on new lines
      examContent += `<div style='margin-left: 15px; margin-bottom: 10px;'>`;
      q.options.forEach(opt => {
          examContent += `<p style='margin: 2px 0;'><strong>${opt.label}.</strong> ${opt.content}</p>`;
      });
      examContent += `</div>`;
    });
  });

  // Answer Key Table
  // Format: 10 columns, Black border, Blue text, Format "1. A"
  const cols = 10;
  const rows = Math.ceil(allQuestions.length / cols);
  
  let answerTable = `
    <div style='margin-top: 30px; border-top: 2px solid #000; padding-top: 20px;'>
    <h3 style='text-align: center; color: #1d4ed8;'>ĐÁP ÁN - MÃ ĐỀ: ${exam.code}</h3>
    <table style='width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 11pt; border: 2px solid #000;'>
  `;

  for (let r = 0; r < rows; r++) {
      answerTable += "<tr>";
      for (let c = 0; c < cols; c++) {
          const idx = r * cols + c;
          if (idx < allQuestions.length) {
              const q = allQuestions[idx];
              answerTable += `<td style='border: 1px solid #000; padding: 8px; text-align: center;'>
                  <span style='font-weight: bold; color: #1e3a8a;'>${q.number}. ${q.answer}</span>
              </td>`;
          } else {
              answerTable += `<td style='border: 1px solid #000; padding: 8px;'></td>`;
          }
      }
      answerTable += "</tr>";
  }
  answerTable += "</table></div>";

  const body = examContent + answerTable;

  return `
    <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
    <head>
      <meta charset="utf-8">
      <title>Exam Output</title>
      <style>
        body { font-family: 'Be Vietnam Pro', 'Times New Roman', serif; font-size: 12pt; line-height: 1.4; color: #000; }
        p { margin: 5px 0; }
        table { border-collapse: collapse; width: 100%; }
        td, th { border: 1px solid black; }
      </style>
    </head>
    <body>
      ${body}
    </body>
    </html>
  `;
};