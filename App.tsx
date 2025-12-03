import React from 'react';
import ExamEditor from './components/ExamEditor';

const App: React.FC = () => {
  // Pass apiKey availability is handled internally via localStorage now
  const envKeyAvailable = !!process.env.API_KEY;

  return (
    <div className="h-full">
      <ExamEditor apiKeyAvailable={envKeyAvailable} />
    </div>
  );
};

export default App;