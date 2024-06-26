import {
  ChatModule,
  ChatOptions,
  ChatWorkerClient,
  InitProgressReport,
} from "@mlc-ai/web-llm";
import { OpenAI } from "openai";
import React, {
  ReactNode,
  createContext,
  useCallback,
  useMemo,
  useState,
} from "react";
import { appConfig, chatOpts } from "./configs";
import { ContextType, PromptResponse } from "./types";
import { formatPrompt } from "./utils";

let chat: ChatWorkerClient | ChatModule = new ChatModule();

if (typeof window !== "undefined") {
  chat = new ChatWorkerClient(
    new Worker(new URL("./worker.ts", import.meta.url), { type: "module" })
  );
}

const openai = new OpenAI({
  apiKey: "My api key",
  dangerouslyAllowBrowser: true,
});
// const openai = new OpenAI({
//   apiKey: import.meta.env.VITE_PUBLIC_OPEN_AI_API_KEY,
//   dangerouslyAllowBrowser: true,
// });

const Context = createContext<ContextType | undefined>(undefined);

/**
 * Provider Component to manage and share chat states.
 * @param {ReactNode} children - Children components wrapped by this Provider.
 * @returns {JSX.Element} Provider component.
 */
const Provider: React.FC<{ children: ReactNode }> = ({ children }) => {
  // State definitions
  const [system, setSystem] = useState(
    chatOpts.conv_config?.system_template || ""
  );
  const [log, setLog] = useState("");
  const [progress, setProgress] = useState("");
  const [messages, setMessages] = useState<PromptResponse[]>([]);
  const [source, setSource] = useState("web-llm");
  const [message, setMessage] = useState("");
  const [code, setCode] = useState("");
  const [context, setContext] = useState("");
  const [language, setLanguage] = useState("");
  const [model, setModel] = useState("Llama-2-7b-chat-hf-q4f32_1");
  const [options, setOptions] = useState<ChatOptions>(chatOpts);
  const [optionsUpdated, setOptionsUpdated] = useState(true);
  const [chatLoading, setChatLoading] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [layout, setLayout] = useState("chat");

  // Calculate prompt value based on language, context, message, and code
  const prompt = useMemo(
    () => formatPrompt(language, context, message, code),
    [language, context, message, code]
  );

  // Callbacks & Handlers
  const setSingleOption = useCallback(
    (key: keyof ChatOptions, value: string | number) => {
      setOptions((prev) => ({ ...prev, [key]: value }));
    },
    []
  );

  const stop = useCallback(() => {
    chat.interruptGenerate();
  }, []);

  /**
   * Reloads chat configuration and initializes chat.
   */
  const reload = useCallback(async () => {
    setChatLoading(true);
    setLog("");
    try {
      await chat.unload();
      await chat.resetChat();
      chat.setInitProgressCallback((report: InitProgressReport) => {
        setProgress(report.text);
      });
      await chat.reload(
        model,
        {
          ...chatOpts,
          ...options,
        },
        appConfig
      );
      setOptionsUpdated(false);
      setChatLoading(false);
    } catch (err: unknown) {
      setProgress("Init error, " + (err?.toString() ?? ""));
      setChatLoading(false);
    }
  }, [model, options]);

  const reset = useCallback(async () => {
    setMessages([]);
    chat.resetChat();
    setOptions(chatOpts);
    setOptionsUpdated(true);
    reload();
  }, [reload]);

  /**
   * Handles sending messages via OpenAI.
   */
  const handleOpenAiMessage = useCallback(async () => {
    const oldMessages = messages;
    const stream = await openai.chat.completions.create({
      model: model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: prompt },
      ],
      stream: true,
      temperature: options.temperature,
      top_p: options.top_p,
      max_tokens: 10000,
      frequency_penalty: options.repetition_penalty,
    });

    setChatLoading(false);
    let response = "";
    for await (const part of stream) {
      response += part.choices[0]?.delta?.content || "";
      setMessages([{ value: response, model: model }, ...oldMessages]);
    }
  }, [
    messages,
    model,
    system,
    prompt,
    options.temperature,
    options.top_p,
    options.repetition_penalty,
  ]);

  const sendWebLLMMessage = useCallback(async () => {
    const oldMessages = messages;
    let chatLoadingStopped = false;
    await chat.generate(prompt, async (_step, response) => {
      if (!chatLoadingStopped && response !== "") {
        chatLoadingStopped = true;
        setChatLoading(false);
      }
      setMessages([{ value: response, model: model }, ...oldMessages]);
      setLog(await chat.runtimeStatsText());
    });
  }, [messages, prompt, model]);

  /**
   * Sends messages using the WebLLM method.
   */
  const handleWebLLMMessage = useCallback(async () => {
    if (!optionsUpdated) {
      await sendWebLLMMessage();
    } else {
      await reload();
      await sendWebLLMMessage();
    }
  }, [optionsUpdated, sendWebLLMMessage, reload]);

  /**
   * Determines the source and sends the message accordingly.
   */
  const sendMessage = useCallback(async () => {
    setChatLoading(true);
    if (source === "open-ai") {
      await handleOpenAiMessage();
    } else {
      await handleWebLLMMessage();
    }
    setChatLoading(false);
  }, [source, handleOpenAiMessage, handleWebLLMMessage]);

  const sendCommand = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    async (_command: string) => {
      // chat.generate(command, async (_step, response) => {
      //   setMessages([{ value: response, model: model }, ...oldMessages]);
      //   setLog(await chat.runtimeStatsText());
      // });
    },
    []
  );

  // Provider value
  const value = {
    setOptionsUpdated,
    log,
    setLog,
    progress,
    setProgress,
    messages,
    setMessages,
    message,
    setMessage,
    chatLoading,
    setChatLoading,
    model,
    setModel,
    system,
    setSystem,
    context,
    setContext,
    source,
    setSource,
    code,
    language,
    options,
    setSingleOption,
    setLanguage,
    setCode,
    reset,
    stop,
    sendMessage,
    sendCommand,
    fullscreen,
    setFullscreen,
    layout,
    setLayout,
  };

  return <Context.Provider value={value}>{children}</Context.Provider>;
};

export { Context, Provider };
