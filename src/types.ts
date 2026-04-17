export interface ECGAnalysisResult {
  heartRate: number;
  rhythm: string;
  pWave: string;
  qrsComplex: string;
  stSegment: string;
  interpretation: string;
  riskAssessment: 'Low' | 'Moderate' | 'High';
  findings: string[];
  recommendations: string[];
  waveform?: number[];
  aiExplanation?: string;
}

export interface SavedReport {
  id: string;
  date: string;
  imageUrl: string;
  patientName: string;
  patientAge: string;
  patientGender: string;
  analysis: ECGAnalysisResult;
}
