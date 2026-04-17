import { GoogleGenAI, ThinkingLevel, Type } from "@google/genai";
import { ECGAnalysisResult } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const ANALYSIS_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    heartRate: { type: Type.NUMBER },
    rhythm: { type: Type.STRING },
    pWave: { type: Type.STRING },
    qrsComplex: { type: Type.STRING },
    stSegment: { type: Type.STRING },
    interpretation: { type: Type.STRING },
    riskAssessment: { 
      type: Type.STRING, 
      enum: ["Low", "Moderate", "High"] 
    },
    findings: { 
      type: Type.ARRAY, 
      items: { type: Type.STRING } 
    },
    recommendations: { 
      type: Type.ARRAY, 
      items: { type: Type.STRING } 
    },
    waveform: { 
      type: Type.ARRAY, 
      items: { type: Type.NUMBER } 
    },
    aiExplanation: { type: Type.STRING }
  },
  required: [
    "heartRate", "rhythm", "pWave", "qrsComplex", 
    "stSegment", "interpretation", "riskAssessment", 
    "findings", "recommendations", "waveform", "aiExplanation"
  ]
};

function extractJsonSafely(text: string): any {
  try {
    // Try direct parsing first
    return JSON.parse(text.trim());
  } catch (e) {
    // If it fails, try to find the first { and last }
    const startIdx = text.indexOf('{');
    const endIdx = text.lastIndexOf('}');
    
    if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
      const jsonString = text.substring(startIdx, endIdx + 1);
      try {
        return JSON.parse(jsonString);
      } catch (innerError) {
        console.error("Failed to parse extracted JSON string:", innerError);
        throw new Error("Diagnosis output was malformed. Please try scanning again.");
      }
    }
    throw new Error("No valid diagnosis data found in the response.");
  }
}

export async function analyzeECGImage(base64Image: string, patientInfo?: { name: string, age: string, gender: string }): Promise<ECGAnalysisResult> {
  const patientContext = patientInfo ? `\nPatient Context: Name: ${patientInfo.name}, Age: ${patientInfo.age}, Gender: ${patientInfo.gender}` : "";
  const prompt = `You are a Senior Cardiologist. Analyze the provided 12-lead ECG image with extreme precision. ${patientContext}
  
  Instructions:
  1. Carefully read ANY text diagnoses printed on the ECG paper (e.g., "ABNORMAL ECG", "ST elevation", "Anterolateral injury", "LVH").
  2. Inspect the waveforms for ST segment elevation or depression, T-wave inversions, and QRS voltage.
  3. If there is ANY text on the image indicating an abnormality, you MUST reflect that in the findings and risk assessment.
  4. If you see signs of Myocardial Infarction (STEMI), Ischemia, or Hypertrophy, set riskAssessment to "High".
  
  Important: Return exactly the JSON structure required by the schema. Accuracy is critical for clinical safety simulations.`;

  const response = await ai.models.generateContent({
    model: "gemini-3.1-flash-lite-preview",
    contents: {
      parts: [
        { text: prompt },
        {
          inlineData: {
            mimeType: "image/png",
            data: base64Image.split(',')[1] || base64Image
          }
        }
      ]
    },
    config: {
      responseMimeType: "application/json",
      responseSchema: ANALYSIS_SCHEMA,
      thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL }
    }
  });

  if (!response.text) {
    throw new Error("Empty response from Gemini API");
  }

  return extractJsonSafely(response.text) as ECGAnalysisResult;
}

export async function analyzeFacialVitals(base64Image: string, patientInfo?: { name: string, age: string, gender: string }): Promise<ECGAnalysisResult> {
  const patientContext = patientInfo ? `\nPatient Context: Name: ${patientInfo.name}, Age: ${patientInfo.age}, Gender: ${patientInfo.gender}` : "";
  const prompt = `You are a specialist in Remote Photoplethysmography (rPPG). Analyze the micro-fluctuations in skin color from this facial image to extract physiological data. ${patientContext}
  
  Instructions:
  1. Detect the pulse rate (bpm) and heart rate variability (HRV).
  2. Use your internal model of Bayesian inference to determine the most likely heart rhythm based on these rPPG markers.
  3. This is NOT random data; it is a clinical estimation based on visual hemodynamics.
  
  Important: Return exactly the JSON structure required by the schema. Accuracy in simulation is paramount.`;

  const response = await ai.models.generateContent({
    model: "gemini-3.1-flash-lite-preview",
    contents: {
      parts: [
        { text: prompt },
        {
          inlineData: {
            mimeType: "image/png",
            data: base64Image.split(',')[1] || base64Image
          }
        }
      ]
    },
    config: {
      responseMimeType: "application/json",
      responseSchema: ANALYSIS_SCHEMA,
      thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL }
    }
  });

  if (!response.text) {
    throw new Error("Empty response from Gemini API");
  }

  return extractJsonSafely(response.text) as ECGAnalysisResult;
}
