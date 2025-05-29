export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  attachedContext?: AttachedContext[];
}

export interface AttachedContext {
  id: string;
  type: "collection" | "definition" | "editor" | "view";
  title: string;
  content: string;
  metadata?: {
    fileName?: string;
    language?: string;
    lineNumbers?: string;
    collectionName?: string;
  };
}

export interface Collection {
  id: string;
  name: string;
  description?: string;
  sampleDocument: any;
  documentCount: number;
}

export interface View {
  id: string;
  name: string;
  viewOn: string;
  pipeline: any[];
  description?: string;
}

export interface Definition {
  id: string;
  name: string;
  type: "function" | "class" | "interface" | "type";
  content: string;
  fileName: string;
  lineNumbers: string;
}

export interface ChatProps {
  currentEditorContent?: {
    content: string;
    fileName?: string;
    language?: string;
  };
}
