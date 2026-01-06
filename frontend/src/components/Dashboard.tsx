import { useState, useEffect, useCallback } from 'react';
import { Play, Upload, Image as ImageIcon, X, Loader2, AlertCircle, Download, ChevronDown, ChevronUp, Sparkles, Info, Layers, Wand2, Copy, Check, FileSpreadsheet, ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react';
import { apiClient, getOpenAIKey, getOpenAIModel, getApiKey } from '../api/client';
import clsx from 'clsx';

interface Props {
    apiKey: string;
    mode: 'generate' | 'results' | 'gallery' | 'prompts' | 'classifier';
    onBatchComplete?: () => void;
}

// Info Tooltip component
function InfoTip({ text }: { text: string }) {
    const [show, setShow] = useState(false);
    return (
        <div className="relative inline-block">
            <Info
                className="w-3.5 h-3.5 text-zinc-500 hover:text-indigo-400 cursor-help transition"
                onMouseEnter={() => setShow(true)}
                onMouseLeave={() => setShow(false)}
            />
            {show && (
                <div className="absolute z-50 left-1/2 -translate-x-1/2 bottom-full mb-2 w-64 p-3 bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl text-xs text-zinc-300 leading-relaxed">
                    {text}
                    <div className="absolute left-1/2 -translate-x-1/2 top-full w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-zinc-700" />
                </div>
            )}
        </div>
    );
}

export default function Dashboard({ apiKey, mode, onBatchComplete }: Props) {
    if (mode === 'generate') {
        return <GeneratorView apiKey={apiKey} onBatchComplete={onBatchComplete} />;
    }
    if (mode === 'prompts') {
        return <PromptStudioView />;
    }
    if (mode === 'classifier') {
        return <ClassifierView />;
    }
    if (mode === 'gallery') {
        return <GalleryView />;
    }
    return <ResultsView />;
}

function GeneratorView({ apiKey, onBatchComplete }: { apiKey: string, onBatchComplete?: () => void }) {
    const [models, setModels] = useState<any[]>([]);
    const [prompts, setPrompts] = useState('');
    const [selectedModel, setSelectedModel] = useState('');

    // Custom Model / LoRA support
    const [useCustomModel, setUseCustomModel] = useState(false);
    const [customModelId, setCustomModelId] = useState('');
    const [loraId, setLoraId] = useState('');
    const [loraWeight, setLoraWeight] = useState(1.0);  // Default 1.0 for better adherence
    const [triggerWord, setTriggerWord] = useState('');  // Trigger word to prepend to prompts

    // Settings
    const [width, setWidth] = useState(1024);
    const [height, setHeight] = useState(1024);
    const [numImages, setNumImages] = useState(1);
    const [refImages, setRefImages] = useState<File[]>([]);  // Multiple reference images
    const [refImageMode, setRefImageMode] = useState<'cycle' | 'all' | 'combined'>('combined'); // How to apply refs
    const [referenceType, setReferenceType] = useState<'character' | 'style' | 'content' | 'basic'>('character'); // ControlNet type
    const [initStrength, setInitStrength] = useState(0.3); // Lower = more similar to reference
    const [negativePrompt, setNegativePrompt] = useState('extra limbs, extra arms, extra legs, deformed hands, deformed fingers, malformed limbs, disfigured, bad anatomy, mutated, ugly, blurry, low quality');

    // Important Variants
    const [impVariant, setImpVariant] = useState('');
    const IMPORTANT_VARIANTS = [
        { label: "Summoning digital vines", value: "summoning_digital_vines" },
        { label: "Holding two coins fused", value: "holding_two_coins_fused" },
        { label: "Wearing an amulet", value: "wearing_an_amulet" },
        { label: "Raising a cube", value: "raising_a_cube" },
        { label: "Cradling a miniature world", value: "cradling_a_miniature_world" },
        { label: "Holding a holographic display", value: "holding_a_holographic_display" },
        { label: "Holding a staff", value: "holding_a_staff" },
        { label: "Grasping a coin", value: "grasping_a_coin" },
        { label: "Holding a glowing seed", value: "holding_a_glowing_seed" },
        { label: "Cradling a glowing acorn", value: "cradling_a_glowing_acorn" },
        { label: "Raising a golden token", value: "raising_a_golden_token" },
        { label: "Holding up a circular item", value: "holding_up_a_circular_item" }
    ];

    // Advanced settings
    const [showAdvanced, setShowAdvanced] = useState(false);
    const [guidanceScale, setGuidanceScale] = useState(7);  // CFG scale (1-20)
    const [numSteps, setNumSteps] = useState(30);  // Inference steps (10-60)
    const [scheduler, setScheduler] = useState('EULER_DISCRETE');
    const [alchemy, setAlchemy] = useState(false);  // AI enhancement
    const [enhancePrompt, setEnhancePrompt] = useState(false);  // Auto improve prompt
    const [presetStyle, setPresetStyle] = useState('');  // Visual style preset
    const [seed, setSeed] = useState<number | ''>('');  // Empty = random

    // Lightbox state
    const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

    const [isSubmitting, setIsSubmitting] = useState(false);
    const [batchId, setBatchId] = useState<string | null>(null);
    const [jobStatus, setJobStatus] = useState<any>(null);

    useEffect(() => {
        // Load models
        apiClient.get('/models', { params: { apiKey } })
            .then(res => {
                setModels(res.data);
                if (res.data.length > 0) setSelectedModel(res.data[0].id);
            })
            .catch(console.error);
    }, [apiKey]);

    useEffect(() => {
        if (!batchId) return;

        const poll = setInterval(() => {
            apiClient.get(`/jobs/${batchId}`)
                .then(res => setJobStatus(res.data))
                .catch(console.error);
        }, 2000);

        return () => clearInterval(poll);
    }, [batchId]);

    // Detect if current model is Flux Kontext (which has limited image reference options)
    const effectiveModelId = useCustomModel && customModelId.trim() ? customModelId.trim() : selectedModel;
    const isFluxKontext = effectiveModelId === '28aeddf8-bd19-4803-80fc-79602d1a9989' ||
        effectiveModelId.toLowerCase().includes('kontext');

    const handleSubmit = async () => {
        setIsSubmitting(true);
        try {
            // Upload all reference images first
            const uploadedImageIds: string[] = [];
            for (const refImage of refImages) {
                const formData = new FormData();
                formData.append('apiKey', apiKey);
                formData.append('file', refImage);
                const uploadRes = await fetch('http://localhost:8000/api/v1/upload/init-image', {
                    method: 'POST',
                    body: formData
                });
                if (!uploadRes.ok) {
                    throw new Error(`Upload failed: ${uploadRes.status} `);
                }
                const uploadData = await uploadRes.json();
                uploadedImageIds.push(uploadData.imageId);
            }

            const lines = prompts.split('\n').filter(p => p.trim());
            if (lines.length === 0) {
                alert("Please enter at least one prompt");
                setIsSubmitting(false);
                return;
            }

            // effectiveModelId is computed at component level above

            // Helper to parse prompt with optional prompt number and per-line negative prompt
            // Syntax: "[number] positive prompt --neg negative prompt"
            // If using an Element with a trigger word, prepend it to the prompt
            const parsePromptLine = (line: string) => {
                // First, extract prompt number if present: [001], [1], [0001], etc.
                const numberMatch = line.match(/^\[(\d+)\]\s*/);
                let promptNumber: number | undefined;
                let remainingLine = line;

                if (numberMatch) {
                    promptNumber = parseInt(numberMatch[1], 10);
                    remainingLine = line.slice(numberMatch[0].length);
                }

                // Then parse negative prompt
                const negMatch = remainingLine.match(/^(.+?)\s*--neg\s+(.+)$/i);
                let basePrompt: string;
                let negative: string | undefined;

                if (negMatch) {
                    basePrompt = negMatch[1].trim();
                    negative = negMatch[2].trim();
                } else {
                    basePrompt = remainingLine.trim();
                    negative = negativePrompt.trim() || undefined;
                }

                // Prepend trigger word if Element is being used and trigger word is set
                // Also handle Important Variant injection
                const variantObj = IMPORTANT_VARIANTS.find(v => v.value === impVariant);

                let promptWithTrigger = (loraId.trim() && triggerWord.trim())
                    ? `${triggerWord.trim()}, ${basePrompt} `
                    : basePrompt;

                // Inject Important Variant if specific (append text description, append slug for filename)
                if (variantObj) {
                    promptWithTrigger = `${promptWithTrigger}, ${variantObj.label} imp = ${variantObj.value} `;
                }

                return {
                    prompt: promptWithTrigger,
                    negative,
                    prompt_number: promptNumber
                };
            };

            // Common advanced params
            const advancedParams = {
                guidance_scale: guidanceScale,
                num_inference_steps: numSteps,
                scheduler: scheduler,
                alchemy: alchemy || undefined,
                enhancePrompt: enhancePrompt || undefined,
                presetStyle: presetStyle || undefined,
                seed: seed !== '' ? seed : undefined,
            };

            // Build items based on reference image mode
            let items: any[] = [];

            if (uploadedImageIds.length === 0) {
                // No reference images - just use prompts
                items = lines.map(p => {
                    const parsed = parsePromptLine(p);
                    return {
                        prompt: parsed.prompt,
                        prompt_number: parsed.prompt_number,
                        negative_prompt: parsed.negative,
                        modelId: effectiveModelId,
                        width,
                        height,
                        num_images: numImages,
                        userElements: loraId.trim() ? [{ userLoraId: Number(loraId.trim()), weight: loraWeight }] : undefined,
                        ...advancedParams
                    };
                });
            } else if (refImageMode === 'combined') {
                // Combined mode: ALL images are sent as multiple references to a SINGLE generation
                // This matches how Leonardo portal uses multiple reference images for consistency
                items = lines.map(p => {
                    const parsed = parsePromptLine(p);
                    return {
                        prompt: parsed.prompt,
                        prompt_number: parsed.prompt_number,
                        negative_prompt: parsed.negative,
                        modelId: effectiveModelId,
                        width,
                        height,
                        num_images: numImages,
                        // Send ALL image IDs as an array for multiple controlnets
                        init_image_ids: uploadedImageIds,  // Array of image IDs
                        strength: 1 - initStrength,
                        reference_mode: referenceType,
                        userElements: loraId.trim() ? [{ userLoraId: Number(loraId.trim()), weight: loraWeight }] : undefined,
                        ...advancedParams
                    };
                });
            } else if (refImageMode === 'cycle') {
                // Cycle mode: each prompt uses one image (cycles through if more prompts than images)
                items = lines.map((p, idx) => {
                    const parsed = parsePromptLine(p);
                    const imageId = uploadedImageIds[idx % uploadedImageIds.length];
                    return {
                        prompt: parsed.prompt,
                        prompt_number: parsed.prompt_number,
                        negative_prompt: parsed.negative,
                        modelId: effectiveModelId,
                        width,
                        height,
                        num_images: numImages,
                        init_image_id: imageId,
                        // Leonardo API: higher init_strength = more like original
                        // Our slider shows (1 - initStrength) as similarity %
                        // So we send (1 - initStrength) to match what user sees
                        strength: 1 - initStrength,
                        reference_mode: referenceType,
                        userElements: loraId.trim() ? [{ userLoraId: Number(loraId.trim()), weight: loraWeight }] : undefined,
                        ...advancedParams
                    };
                });
            } else {
                // All mode: each prompt × each image = separate generation
                for (const line of lines) {
                    const parsed = parsePromptLine(line);
                    for (const imageId of uploadedImageIds) {
                        items.push({
                            prompt: parsed.prompt,
                            prompt_number: parsed.prompt_number,
                            negative_prompt: parsed.negative,
                            modelId: effectiveModelId,
                            width,
                            height,
                            num_images: numImages,
                            init_image_id: imageId,
                            strength: 1 - initStrength,  // Inverted to match API expectation
                            reference_mode: referenceType,
                            userElements: loraId.trim() ? [{ userLoraId: Number(loraId.trim()), weight: loraWeight }] : undefined,
                            ...advancedParams
                        });
                    }
                }
            }

            // Debug: log what we're sending
            console.log('[DEBUG] Sending batch with items:', items.length);
            console.log('[DEBUG] Reference images count:', refImages.length);
            console.log('[DEBUG] Uploaded image IDs:', uploadedImageIds);
            console.log('[DEBUG] First item:', JSON.stringify(items[0], null, 2));
            console.log('[DEBUG] Advanced params:', { alchemy, presetStyle, guidanceScale, numSteps, scheduler });

            const res = await apiClient.post('/generate/batch', {
                items,
                apiKey
            });

            setBatchId(res.data.batchId);
            setJobStatus(null);

            const checkCompletion = setInterval(async () => {
                try {
                    const statusRes = await apiClient.get(`/ jobs / ${res.data.batchId} `);
                    const s = statusRes.data;
                    setJobStatus(s);
                    if (s.completed + s.failed === s.total) {
                        clearInterval(checkCompletion);
                        if (onBatchComplete) onBatchComplete();
                    }
                } catch (e) {
                    clearInterval(checkCompletion);
                }
            }, 2000);

        } catch (e) {
            alert("Failed to submit batch: " + e);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="h-full flex">
            {/* Left Config Panel */}
            <div className="w-[400px] border-r border-zinc-800 p-6 overflow-y-auto bg-surface/20">
                <h2 className="text-lg font-semibold mb-6">Configuration</h2>

                <div className="space-y-6">
                    {/* Model */}
                    <div className="space-y-2">
                        <div className="flex justify-between items-center">
                            <label className="text-sm text-zinc-400">Model</label>
                            <label className="flex items-center gap-2 cursor-pointer">
                                <span className="text-xs text-zinc-500">Custom ID</span>
                                <input
                                    type="checkbox"
                                    checked={useCustomModel}
                                    onChange={e => setUseCustomModel(e.target.checked)}
                                    className="w-4 h-4 accent-indigo-500"
                                />
                            </label>
                        </div>

                        {!useCustomModel ? (
                            <select
                                value={selectedModel} onChange={e => setSelectedModel(e.target.value)}
                                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm"
                            >
                                {models.map(m => (
                                    <option key={m.id} value={m.id}>{m.name}</option>
                                ))}
                            </select>
                        ) : (
                            <input
                                type="text"
                                value={customModelId}
                                onChange={e => setCustomModelId(e.target.value)}
                                placeholder="Enter custom model ID (e.g. your Flux Dev trained model)"
                                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm font-mono"
                            />
                        )}
                        {/* Debug: Show effective model ID */}
                        <p className="text-[10px] text-zinc-600 font-mono truncate">
                            Using: {useCustomModel && customModelId.trim() ? customModelId.trim() : selectedModel || 'None selected'}
                        </p>
                    </div>

                    {/* Element/LoRA Support */}
                    <div className="space-y-2">
                        <label className="text-sm text-zinc-400">Element ID (Optional)</label>
                        <input
                            type="text"
                            value={loraId}
                            onChange={e => setLoraId(e.target.value)}
                            placeholder="User LoRA ID (numeric, e.g. 170314)"
                            className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm font-mono"
                        />
                        {loraId.trim() && (
                            <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-3 space-y-3">
                                {/* Trigger Word */}
                                <div className="space-y-1">
                                    <div className="flex items-center gap-2">
                                        <label className="text-xs text-zinc-400">Trigger Word</label>
                                        <InfoTip text="A keyword that activates your Element. This will be prepended to all prompts. Use the name you trained the Element with (e.g. TREEDUDE, aquacat)." />
                                    </div>
                                    <input
                                        type="text"
                                        value={triggerWord}
                                        onChange={e => setTriggerWord(e.target.value)}
                                        placeholder="e.g. TREEDUDE"
                                        className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1.5 text-sm font-mono"
                                    />
                                </div>

                                {/* Element Weight */}
                                <div className="space-y-1">
                                    <div className="flex justify-between items-center">
                                        <div className="flex items-center gap-2">
                                            <label className="text-xs text-zinc-400">Element Weight</label>
                                            <InfoTip text="How strongly the Element influences the output. Higher = more like your trained Element. 1.0 is standard, try 1.5-2.0 for stronger effect." />
                                        </div>
                                        <span className="text-xs font-mono text-indigo-400">{loraWeight.toFixed(2)}</span>
                                    </div>
                                    <input
                                        type="range"
                                        min="0.5"
                                        max="2.0"
                                        step="0.1"
                                        value={loraWeight}
                                        onChange={e => setLoraWeight(Number(e.target.value))}
                                        className="w-full accent-indigo-500"
                                    />
                                    <div className="flex justify-between text-[10px] text-zinc-600">
                                        <span>Subtle (0.5)</span>
                                        <span>Standard (1.0)</span>
                                        <span>Strong (2.0)</span>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Important Variant (IMP) */}
                    <div className="space-y-2">
                        <div className="flex items-center gap-2">
                            <label className="text-sm text-zinc-400">Important Variant</label>
                            <InfoTip text="Select a variant to be included in the generation. The description will be added to your prompt, and the 'imp' variants will be tracked in the filename." />
                        </div>
                        <select
                            value={impVariant}
                            onChange={e => setImpVariant(e.target.value)}
                            className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm"
                        >
                            <option value="">None</option>
                            {IMPORTANT_VARIANTS.map(v => (
                                <option key={v.value} value={v.value}>{v.label}</option>
                            ))}
                        </select>
                    </div>

                    {/* Advanced Settings */}
                    <div className="space-y-2">
                        <button
                            onClick={() => setShowAdvanced(!showAdvanced)}
                            className="flex items-center justify-between w-full text-sm text-zinc-400 hover:text-zinc-300 transition"
                        >
                            <span className="flex items-center gap-2">
                                <Sparkles className="w-4 h-4" />
                                Advanced Settings
                            </span>
                            {showAdvanced ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </button>

                        {showAdvanced && (
                            <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-4 space-y-4">
                                {/* Guidance Scale (CFG) */}
                                <div className="space-y-2">
                                    <div className="flex justify-between items-center">
                                        <div className="flex items-center gap-2">
                                            <label className="text-xs text-zinc-400">Guidance Scale (CFG)</label>
                                            <InfoTip text={isFluxKontext
                                                ? "Controls prompt adherence. For Flux Kontext, Leonardo recommends CFG=7. Higher = stricter prompt following. Range: 1-20."
                                                : "Controls how strictly the AI follows your text prompt. Higher values = more prompt adherence. Lower values (5-7) = more weight to reference image. For characters, try 5-7."
                                            } />
                                        </div>
                                        <span className="text-xs font-mono text-indigo-400">{guidanceScale}</span>
                                    </div>
                                    <input
                                        type="range" min="1" max="20" value={guidanceScale}
                                        onChange={e => setGuidanceScale(Number(e.target.value))}
                                        className="w-full accent-indigo-500"
                                    />
                                    <div className="flex justify-between text-[10px] text-zinc-600">
                                        <span>🎨 Creative (1-5)</span>
                                        <span className={isFluxKontext ? "text-green-500 font-medium" : ""}>
                                            {isFluxKontext ? "✓ Recommended (7)" : "📝 Balanced (7)"}
                                        </span>
                                        <span>📝 Strict (15+)</span>
                                    </div>
                                    {isFluxKontext && guidanceScale !== 7 && (
                                        <p className="text-[10px] text-amber-500/80">
                                            ℹ️ Leonardo recommends CFG=7 for Flux Kontext. Current: {guidanceScale}
                                        </p>
                                    )}
                                </div>

                                {/* Inference Steps */}
                                <div className="space-y-2">
                                    <div className="flex justify-between items-center">
                                        <div className="flex items-center gap-2">
                                            <label className="text-xs text-zinc-400">Quality Steps</label>
                                            <InfoTip text="Number of refinement iterations. More steps = higher quality but slower. 30 is a good balance. 50+ for maximum detail." />
                                        </div>
                                        <span className="text-xs font-mono text-indigo-400">{numSteps}</span>
                                    </div>
                                    <input
                                        type="range" min="10" max="60" step="5" value={numSteps}
                                        onChange={e => setNumSteps(Number(e.target.value))}
                                        className="w-full accent-indigo-500"
                                    />
                                    <p className="text-[10px] text-zinc-600">More steps = better quality, slower generation</p>
                                </div>

                                {/* Scheduler */}
                                <div className="space-y-2">
                                    <label className="text-xs text-zinc-400">Scheduler</label>
                                    <select
                                        value={scheduler}
                                        onChange={e => setScheduler(e.target.value)}
                                        className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-xs"
                                    >
                                        <option value="EULER_DISCRETE">Euler</option>
                                        <option value="EULER_ANCESTRAL_DISCRETE">Euler Ancestral</option>
                                        <option value="HEUN_DISCRETE">Heun</option>
                                        <option value="DPM_2_DISCRETE">DPM 2</option>
                                        <option value="DPM_2_ANCESTRAL_DISCRETE">DPM 2 Ancestral</option>
                                        <option value="LMS_DISCRETE">LMS</option>
                                        <option value="LEONARDO">Leonardo</option>
                                    </select>
                                </div>

                                {/* Preset Style */}
                                <div className="space-y-2">
                                    <div className="flex items-center gap-2">
                                        <label className="text-xs text-zinc-400">Preset Style</label>
                                        <InfoTip text={isFluxKontext
                                            ? "Visual style preset. Flux Kontext supports styles directly without needing Alchemy enabled."
                                            : "Visual style preset. IMPORTANT: These styles ONLY work when Alchemy is enabled! If Alchemy is off, preset styles are ignored by the API."
                                        } />
                                    </div>
                                    <select
                                        value={presetStyle}
                                        onChange={e => {
                                            setPresetStyle(e.target.value);
                                            // Auto-enable Alchemy when a style is selected (only for non-Flux Kontext models)
                                            if (!isFluxKontext && e.target.value && e.target.value !== '') {
                                                setAlchemy(true);
                                            }
                                        }}
                                        className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-xs"
                                    >
                                        <option value="">None</option>
                                        <option value="ANIME">Anime</option>
                                        <option value="CREATIVE">Creative</option>
                                        <option value="DYNAMIC">Dynamic</option>
                                        <option value="ENVIRONMENT">Environment</option>
                                        <option value="GENERAL">General</option>
                                        <option value="ILLUSTRATION">Illustration</option>
                                        <option value="PHOTOGRAPHY">Photography</option>
                                        <option value="RAYTRACED">Raytraced</option>
                                        <option value="RENDER_3D">3D Render</option>
                                        <option value="SKETCH_BW">Sketch B&W</option>
                                        <option value="SKETCH_COLOR">Sketch Color</option>
                                    </select>
                                    {/* Warning about Alchemy - only show for non-Flux Kontext models */}
                                    {!isFluxKontext && presetStyle && !alchemy && (
                                        <div className="flex items-center gap-1 text-[10px] text-yellow-500">
                                            <AlertCircle className="w-3 h-3" />
                                            Style requires Alchemy ON to work!
                                        </div>
                                    )}
                                    {!isFluxKontext && presetStyle && alchemy && (
                                        <p className="text-[10px] text-green-500">✓ Alchemy enabled - style will apply</p>
                                    )}
                                    {/* Flux Kontext style message */}
                                    {isFluxKontext && presetStyle && (
                                        <p className="text-[10px] text-green-500">✓ Style will apply (Flux Kontext supports styles directly)</p>
                                    )}
                                </div>

                                {/* Toggles - hide Alchemy for Flux Kontext since it's not relevant */}
                                <div className="space-y-2">
                                    <div className="grid grid-cols-2 gap-2">
                                        {!isFluxKontext && (
                                            <label className="flex items-center gap-2 cursor-pointer">
                                                <input
                                                    type="checkbox" checked={alchemy}
                                                    onChange={e => setAlchemy(e.target.checked)}
                                                    className="w-4 h-4 accent-indigo-500"
                                                />
                                                <div className="flex items-center gap-1">
                                                    <span className="text-xs text-zinc-400">Alchemy</span>
                                                    <InfoTip text="AI Enhancement that improves quality and enables Preset Styles. REQUIRED for styles like Illustration, Raytraced, Anime, etc. to work!" />
                                                </div>
                                            </label>
                                        )}
                                        <label className="flex items-center gap-2 cursor-pointer">
                                            <input
                                                type="checkbox" checked={enhancePrompt}
                                                onChange={e => setEnhancePrompt(e.target.checked)}
                                                className="w-4 h-4 accent-indigo-500"
                                            />
                                            <span className="text-xs text-zinc-400">Enhance Prompt</span>
                                        </label>
                                    </div>
                                    {!isFluxKontext && alchemy && (
                                        <p className="text-[10px] text-green-500">✓ Alchemy ON - Preset Styles will work</p>
                                    )}
                                </div>

                                {/* Seed */}
                                <div className="space-y-2">
                                    <label className="text-xs text-zinc-400">Seed (empty = random)</label>
                                    <input
                                        type="number"
                                        value={seed}
                                        onChange={e => setSeed(e.target.value === '' ? '' : Number(e.target.value))}
                                        placeholder="Random"
                                        className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-xs font-mono"
                                    />
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Settings */}
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <label className="text-sm text-zinc-400">Width</label>
                            <input type="number" value={width} onChange={e => setWidth(Number(e.target.value))} className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-sm" />
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm text-zinc-400">Height</label>
                            <input type="number" value={height} onChange={e => setHeight(Number(e.target.value))} className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-sm" />
                        </div>
                    </div>
                    <div className="space-y-2">
                        <label className="text-sm text-zinc-400">Images per prompt</label>
                        <input type="range" min="1" max="8" value={numImages} onChange={e => setNumImages(Number(e.target.value))} className="w-full accent-indigo-500" />
                        <div className="text-right text-xs text-zinc-500">{numImages} images</div>
                    </div>

                    {/* Cost Estimator */}
                    {(() => {
                        const promptCount = prompts.split('\n').filter(x => x.trim()).length;
                        const totalImages = promptCount * numImages;
                        // Leonardo pricing: roughly 24 tokens per image at 1024x1024
                        const pixelCount = width * height;
                        const basePixels = 1024 * 1024;
                        const pixelMultiplier = Math.max(0.5, Math.min(4, pixelCount / basePixels));
                        const tokensPerImage = Math.round(24 * pixelMultiplier);
                        const estimatedCost = totalImages * tokensPerImage;
                        // Pricing: $9 per 3500 tokens
                        const dollarCost = (estimatedCost / 3500) * 9;

                        return promptCount > 0 ? (
                            <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-4 space-y-3">
                                <div className="flex justify-between items-center">
                                    <span className="text-sm text-zinc-400">Estimated Cost</span>
                                    <div className="text-right">
                                        <div className="text-xl font-bold text-yellow-400">{estimatedCost.toLocaleString()} tokens</div>
                                        <div className="text-lg font-semibold text-green-400">${dollarCost.toFixed(2)} USD</div>
                                    </div>
                                </div>
                                <div className="text-xs text-zinc-500 space-y-1 border-t border-zinc-800 pt-2">
                                    <div className="flex justify-between">
                                        <span>Prompts:</span>
                                        <span className="text-zinc-300">{promptCount}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span>Images per prompt:</span>
                                        <span className="text-zinc-300">× {numImages}</span>
                                    </div>
                                    <div className="flex justify-between font-medium">
                                        <span>Total images:</span>
                                        <span className="text-zinc-300">{totalImages}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span>~Tokens/image ({width}×{height}):</span>
                                        <span className="text-zinc-300">~{tokensPerImage}</span>
                                    </div>
                                </div>
                                <div className="text-[10px] text-zinc-600 text-center">
                                    Based on $9 per 3,500 tokens
                                </div>
                            </div>
                        ) : null;
                    })()}

                    {/* Reference Images */}
                    <div className="space-y-2">
                        <div className="flex justify-between items-center">
                            <label className="text-sm text-zinc-400">Reference Images (Optional)</label>
                            {refImages.length > 0 && (
                                <span className="text-xs text-indigo-400">{refImages.length} images</span>
                            )}
                        </div>
                        <div className="border-2 border-dashed border-zinc-800 rounded-lg p-4 text-center hover:border-zinc-700 transition cursor-pointer relative group">
                            <input
                                type="file"
                                multiple
                                accept="image/*"
                                onChange={e => {
                                    if (e.target.files) {
                                        setRefImages(prev => [...prev, ...Array.from(e.target.files!)]);
                                    }
                                }}
                                className="absolute inset-0 opacity-0 cursor-pointer"
                            />
                            <div className="space-y-1">
                                <Upload className="w-6 h-6 mx-auto text-zinc-600 group-hover:text-zinc-500 transition" />
                                <p className="text-xs text-zinc-500">Click to add images (can select multiple)</p>
                            </div>
                        </div>

                        {/* Show uploaded images */}
                        {refImages.length > 0 && (
                            <div className="space-y-2">
                                <div className="flex flex-wrap gap-2">
                                    {refImages.map((file, idx) => (
                                        <div key={idx} className="relative group/img">
                                            <img
                                                src={URL.createObjectURL(file)}
                                                className="w-16 h-16 object-cover rounded border border-zinc-700"
                                            />
                                            <button
                                                onClick={() => setRefImages(prev => prev.filter((_, i) => i !== idx))}
                                                className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center opacity-0 group-hover/img:opacity-100 transition"
                                            >
                                                <X className="w-3 h-3 text-white" />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                                <button
                                    onClick={() => setRefImages([])}
                                    className="text-xs text-red-400 hover:text-red-300"
                                >
                                    Clear all
                                </button>
                            </div>
                        )}

                        {/* Reference image mode selector */}
                        {refImages.length > 1 && (
                            <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-3 space-y-2">
                                <label className="text-xs text-zinc-400">Apply mode</label>
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => setRefImageMode('combined')}
                                        className={clsx(
                                            "flex-1 text-xs py-2 px-3 rounded transition",
                                            refImageMode === 'combined'
                                                ? "bg-green-600 text-white"
                                                : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
                                        )}
                                    >
                                        Combined
                                    </button>
                                    <button
                                        onClick={() => setRefImageMode('cycle')}
                                        className={clsx(
                                            "flex-1 text-xs py-2 px-3 rounded transition",
                                            refImageMode === 'cycle'
                                                ? "bg-indigo-600 text-white"
                                                : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
                                        )}
                                    >
                                        Cycle (1:1)
                                    </button>
                                    <button
                                        onClick={() => setRefImageMode('all')}
                                        className={clsx(
                                            "flex-1 text-xs py-2 px-3 rounded transition",
                                            refImageMode === 'all'
                                                ? "bg-indigo-600 text-white"
                                                : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
                                        )}
                                    >
                                        All (N×M)
                                    </button>
                                </div>
                                <p className="text-[10px] text-zinc-600 text-center">
                                    {refImageMode === 'combined'
                                        ? `All ${refImages.length} images guide EACH generation(best for character consistency)`
                                        : refImageMode === 'cycle'
                                            ? 'Each prompt uses one image (cycles if more prompts than images)'
                                            : `Each prompt × each image = ${prompts.split('\n').filter(x => x.trim()).length * refImages.length} generations`
                                    }
                                </p>
                            </div>
                        )}

                        {/* Similarity slider - only show when reference images are selected */}
                        {refImages.length > 0 && (
                            <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-3 space-y-3 mt-2">
                                {/* Flux Kontext info message */}
                                {isFluxKontext && (
                                    <div className="p-2 bg-amber-950/30 border border-amber-800/30 rounded text-[10px] text-amber-300">
                                        <div className="font-semibold mb-1">⚡ Flux Kontext Mode</div>
                                        <p className="text-amber-300/80">
                                            Flux Kontext uses context-based image guidance. Reference type and strength controls are not available - the model will intelligently use your reference images to guide generation.
                                        </p>
                                    </div>
                                )}

                                {/* Reference Type Selector - hidden for Flux Kontext */}
                                {!isFluxKontext && (
                                    <div>
                                        <div className="flex items-center gap-2 mb-2">
                                            <label className="text-xs text-zinc-400">Reference Type</label>
                                            <InfoTip text="Character: Maintains character appearance across generations. Style: Copies artistic style from reference. Content: Uses overall composition/layout from reference." />
                                        </div>
                                        <div className="grid grid-cols-4 gap-1">
                                            <button
                                                onClick={() => setReferenceType('character')}
                                                className={`px - 2 py - 1.5 text - [10px] rounded transition ${referenceType === 'character' ? 'bg-indigo-600 text-white' : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'} `}
                                            >
                                                👤 Character
                                            </button>
                                            <button
                                                onClick={() => setReferenceType('style')}
                                                className={`px - 2 py - 1.5 text - [10px] rounded transition ${referenceType === 'style' ? 'bg-indigo-600 text-white' : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'} `}
                                            >
                                                🎨 Style
                                            </button>
                                            <button
                                                onClick={() => setReferenceType('content')}
                                                className={`px - 2 py - 1.5 text - [10px] rounded transition ${referenceType === 'content' ? 'bg-indigo-600 text-white' : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'} `}
                                            >
                                                📐 Content
                                            </button>
                                            <button
                                                onClick={() => setReferenceType('basic')}
                                                className={`px - 2 py - 1.5 text - [10px] rounded transition ${referenceType === 'basic' ? 'bg-yellow-600 text-white' : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'} `}
                                            >
                                                🔧 Basic
                                            </button>
                                        </div>
                                        {referenceType === 'basic' && (
                                            <p className="text-[10px] text-yellow-500/80">⚠️ Basic mode: Simple image-to-image (fallback if ControlNet fails)</p>
                                        )}
                                    </div>
                                )}

                                {/* Similarity Slider - hidden for Flux Kontext */}
                                {!isFluxKontext && (
                                    <>
                                        <div className="flex justify-between items-center">
                                            <div className="flex items-center gap-2">
                                                <label className="text-xs text-zinc-400">Reference Strength</label>
                                                <InfoTip text="Controls how closely the output matches your reference image. Higher % = output looks more like your reference. Lower % = more creative freedom." />
                                            </div>
                                            <span className="text-xs font-mono text-indigo-400">{Math.round((1 - initStrength) * 100)}%</span>
                                        </div>
                                        <input
                                            type="range"
                                            min="0.1"
                                            max="0.9"
                                            step="0.05"
                                            value={initStrength}
                                            onChange={e => setInitStrength(Number(e.target.value))}
                                            className="w-full accent-indigo-500"
                                        />
                                        <div className="flex justify-between text-[10px] text-zinc-600">
                                            <span>🎯 Keep reference (90%)</span>
                                            <span>🎨 More creative (10%)</span>
                                        </div>
                                    </>
                                )}

                                {/* Mode-Specific Tips - hidden for Flux Kontext */}
                                {!isFluxKontext && (
                                    <div className="mt-3 p-2 bg-indigo-950/30 border border-indigo-800/30 rounded text-[10px] text-indigo-300 space-y-1">
                                        <div className="font-semibold flex items-center gap-1">
                                            <Sparkles className="w-3 h-3" /> Tips for {referenceType === 'character' ? 'Character' : referenceType === 'style' ? 'Style' : referenceType === 'content' ? 'Content' : 'Basic'} Reference:
                                        </div>
                                        {referenceType === 'character' && (
                                            <ul className="space-y-0.5 text-indigo-300/80">
                                                <li>• <b>Best for</b>: Keeping same character in different scenes</li>
                                                <li>• <b>Warning</b>: May override prompt details (masks, framing)</li>
                                                <li>• If prompt ignored, try <b>Content mode</b> or <b>lower strength</b></li>
                                            </ul>
                                        )}
                                        {referenceType === 'style' && (
                                            <ul className="space-y-0.5 text-indigo-300/80">
                                                <li>• <b>Best for</b>: Applying art style to new content</li>
                                                <li>• Copies colors, textures, artistic techniques</li>
                                                <li>• Your prompt defines the subject, reference defines the look</li>
                                            </ul>
                                        )}
                                        {referenceType === 'content' && (
                                            <ul className="space-y-0.5 text-indigo-300/80">
                                                <li>• <b>Best for</b>: Keeping layout/composition/framing</li>
                                                <li>• Use if you want <b>full-body</b> from ref to stay full-body</li>
                                                <li>• Prompt changes the character, reference keeps the pose</li>
                                            </ul>
                                        )}
                                        {referenceType === 'basic' && (
                                            <ul className="space-y-0.5 text-indigo-300/80">
                                                <li>• <b>Best for</b>: Simple image-to-image modification</li>
                                                <li>• Starts from your image and applies prompt changes</li>
                                                <li>• Use high strength (70%+) to keep most of reference</li>
                                            </ul>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>


                    {/* Prompts */}
                    <div className="space-y-2 flex-1 flex flex-col">
                        <div className="flex justify-between items-center">
                            <div className="flex items-center gap-2">
                                <label className="text-sm text-zinc-400">Prompts (Bulk)</label>
                                <InfoTip text="Enter one prompt per line. You can add per-line negative prompts using: 'your prompt --neg things to avoid'. Lines without --neg use the global negative prompt below." />
                            </div>
                            <label className="text-xs text-indigo-400 cursor-pointer hover:text-indigo-300 transition-colors flex items-center gap-1">
                                <Upload className="w-3 h-3" />
                                Import CSV
                                <input type="file" accept=".csv" className="hidden" onChange={e => {
                                    const file = e.target.files?.[0];
                                    if (file) {
                                        const reader = new FileReader();
                                        reader.onload = (ev) => {
                                            const text = ev.target?.result as string;
                                            const csvLines = text.split('\n');
                                            const extracted: string[] = [];
                                            let headerIdx = 0;

                                            const headers = csvLines[0].split(',').map(h => h.trim().toLowerCase());
                                            if (headers.includes('prompt')) {
                                                headerIdx = headers.indexOf('prompt');
                                            }

                                            for (let i = 1; i < csvLines.length; i++) {
                                                const parts = csvLines[i].split(',');
                                                if (parts[headerIdx]) extracted.push(parts[headerIdx].trim());
                                            }

                                            if (extracted.length === 0 && csvLines.length > 0) {
                                                csvLines.forEach(l => { if (l.trim()) extracted.push(l.trim()) });
                                            }

                                            setPrompts(prev => prev + (prev ? '\n' : '') + extracted.join('\n'));
                                        };
                                        reader.readAsText(file);
                                    }
                                }} />
                            </label>
                        </div>
                        <textarea
                            value={prompts}
                            onChange={e => setPrompts(e.target.value)}
                            placeholder="Enter prompts, one per line..."
                            className="w-full h-40 bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm font-mono focus:ring-1 focus:ring-indigo-500 resize-none"
                        />
                        <p className="text-xs text-zinc-500 text-right">{prompts.split('\n').filter(x => x.trim()).length} prompts</p>
                    </div>

                    {/* Negative Prompt */}
                    <div className="space-y-2">
                        <div className="flex items-center gap-2">
                            <label className="text-sm text-zinc-400">Negative Prompt (Quality Control)</label>
                            <InfoTip text="Tells the AI what to AVOID in the image. The default text helps prevent common issues like extra arms, deformed features, etc. You can edit this or leave it as-is." />
                        </div>
                        <textarea
                            value={negativePrompt}
                            onChange={e => setNegativePrompt(e.target.value)}
                            placeholder="Things to avoid in the image..."
                            className="w-full h-20 bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs font-mono focus:ring-1 focus:ring-red-500/50 resize-none text-zinc-400"
                        />
                        <p className="text-[10px] text-zinc-600">This is the DEFAULT negative prompt used for all lines. Individual lines can override with --neg syntax.</p>
                    </div>

                    <button
                        onClick={handleSubmit}
                        disabled={isSubmitting || !selectedModel}
                        className="w-full bg-indigo-600 hover:bg-indigo-500 text-white py-3 rounded-lg font-bold shadow-lg shadow-indigo-500/20 disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                        {isSubmitting ? <Loader2 className="animate-spin w-5 h-5" /> : <Play className="w-5 h-5 fill-current" />}
                        Start Batch
                    </button>
                </div>
            </div >

            {/* Right Canvas / Results */}
            < div className="flex-1 bg-background p-8 overflow-y-auto" >
                {!batchId && !jobStatus ? (
                    <div className="h-full flex items-center justify-center text-zinc-700 select-none">
                        <div className="text-center">
                            <ImageIcon className="w-24 h-24 mx-auto mb-4 opacity-20" />
                            <p className="text-xl font-medium">Ready to generate</p>
                            <p className="text-sm">Configure your batch and press Start</p>
                        </div>
                    </div>
                ) : (
                    <div className="max-w-5xl mx-auto">
                        <div className="mb-8 flex items-center justify-between">
                            <h2 className="text-2xl font-bold">Current Batch</h2>
                            <div className="flex gap-4 items-center">
                                {jobStatus?.completed > 0 && (
                                    <a
                                        href={`http://localhost:8000/api/v1/jobs/${batchId}/zip`}
                                        target="_blank"
                                        className="flex items-center gap-2 text-xs bg-zinc-800 hover:bg-zinc-700 px-3 py-1.5 rounded transition text-white"
                                    >
                                        <Download className="w-4 h-4" /> Download ZIP
                                    </a >
                                )}
                                <div className="flex gap-4 text-sm font-mono">
                                    <span className="text-zinc-400">Total: <span className="text-white">{jobStatus?.total || 0}</span></span>
                                    <span className="text-green-400">Done: {jobStatus?.completed || 0}</span>
                                    <span className="text-indigo-400">Processing: {jobStatus?.processing || 0}</span>
                                </div>
                            </div >
                        </div >

                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                            {jobStatus?.jobs?.map((job: any) => (
                                <JobCard key={job.id} job={job} onImageClick={setLightboxUrl} />
                            ))}
                        </div>
                    </div >
                )
                }
            </div >

            {/* Lightbox Modal */}
            {
                lightboxUrl && (
                    <div
                        className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-8 cursor-zoom-out"
                        onClick={() => setLightboxUrl(null)}
                    >
                        <button
                            className="absolute top-4 right-4 text-white hover:text-zinc-300 p-2"
                            onClick={() => setLightboxUrl(null)}
                        >
                            <X className="w-8 h-8" />
                        </button>
                        <img
                            src={lightboxUrl}
                            className="max-w-full max-h-full object-contain rounded-lg shadow-2xl"
                            onClick={(e) => e.stopPropagation()}
                        />
                    </div>
                )
            }
        </div >
    );
}

function JobCard({ job, onImageClick }: { job: any, onImageClick?: (url: string) => void }) {
    const displayUrl = job.result?.original_data?.generated_images?.[0]?.url;

    return (
        <div className="bg-surface border border-zinc-800 rounded-xl overflow-hidden group hover:border-zinc-700 transition">
            <div
                className={clsx(
                    "aspect-square bg-black relative flex items-center justify-center",
                    displayUrl && "cursor-zoom-in"
                )}
                onClick={() => displayUrl && onImageClick && onImageClick(displayUrl)}
            >
                {job.status === 'completed' && displayUrl ? (
                    <img src={displayUrl} className="w-full h-full object-cover" loading="lazy" />
                ) : job.status === 'processing' ? (
                    <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
                ) : job.status === 'failed' ? (
                    <AlertCircle className="w-8 h-8 text-red-500" />
                ) : (
                    <div className="text-zinc-700 text-xs">Waiting...</div>
                )}

                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center p-4 pointer-events-none">
                    <p className="text-white text-xs text-center line-clamp-3">{job.prompt}</p>
                </div>
            </div>
            <div className="p-3 border-t border-zinc-800 flex justify-between items-center bg-surface">
                <div className="flex gap-2 items-center">
                    <span className={clsx("w-2 h-2 rounded-full",
                        job.status === 'completed' ? 'bg-green-500' :
                            job.status === 'processing' ? 'bg-indigo-500 animate-pulse' :
                                job.status === 'failed' ? 'bg-red-500' : 'bg-zinc-600'
                    )} />
                    <span className="text-xs uppercase font-medium tracking-wider text-zinc-400">{job.status}</span>
                </div>
            </div>
        </div>
    );
}

function ResultsView() {
    const [history, setHistory] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedImage, setSelectedImage] = useState<any | null>(null);
    const [expandedBatches, setExpandedBatches] = useState<Set<string>>(new Set());

    useEffect(() => {
        apiClient.get('/history')
            .then((res: any) => setHistory(res.data))
            .catch(console.error)
            .finally(() => setLoading(false));
    }, []);

    // Navigation for ResultsView
    const handleNext = useCallback(() => {
        if (!selectedImage || !history.length) return;
        const currentIndex = history.findIndex((item: any) => item.id === selectedImage.id);
        if (currentIndex !== -1 && currentIndex < history.length - 1) {
            setSelectedImage(history[currentIndex + 1]);
        }
    }, [selectedImage, history]);

    const handlePrev = useCallback(() => {
        if (!selectedImage || !history.length) return;
        const currentIndex = history.findIndex((item: any) => item.id === selectedImage.id);
        if (currentIndex !== -1 && currentIndex > 0) {
            setSelectedImage(history[currentIndex - 1]);
        }
    }, [selectedImage, history]);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (!selectedImage) return;
            if (e.key === 'ArrowLeft') handlePrev();
            else if (e.key === 'ArrowRight') handleNext();
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [selectedImage, handleNext, handlePrev]);

    // Group history by batch_id
    const groupedHistory = history.reduce((acc: { [key: string]: any[] }, item: any) => {
        const batchId = item.batch_id || 'ungrouped';
        if (!acc[batchId]) {
            acc[batchId] = [];
        }
        acc[batchId].push(item);
        return acc;
    }, {});

    // Sort batches by most recent first (using the first item's created_at)
    const sortedBatches = Object.entries(groupedHistory).sort((a, b) => {
        const dateA = new Date(a[1][0]?.created_at || 0).getTime();
        const dateB = new Date(b[1][0]?.created_at || 0).getTime();
        return dateB - dateA;
    });

    const toggleBatch = (batchId: string) => {
        setExpandedBatches(prev => {
            const newSet = new Set(prev);
            if (newSet.has(batchId)) {
                newSet.delete(batchId);
            } else {
                newSet.add(batchId);
            }
            return newSet;
        });
    };

    if (loading) return <div className="p-8 text-center text-zinc-500">Loading history...</div>;

    return (
        <div className="p-8 h-full overflow-y-auto">
            <h2 className="text-2xl font-bold mb-6">History</h2>

            {sortedBatches.length === 0 ? (
                <div className="text-center text-zinc-500 py-12">
                    <ImageIcon className="w-16 h-16 mx-auto mb-4 opacity-30" />
                    <p>No generation history yet</p>
                </div>
            ) : (
                <div className="space-y-6">
                    {sortedBatches.map(([batchId, items]) => {
                        const isExpanded = expandedBatches.has(batchId) || sortedBatches.length === 1;
                        const firstItem = items[0];
                        const batchDate = new Date(firstItem?.created_at);
                        const displayDate = batchDate.toLocaleDateString('en-AU', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit'
                        });

                        return (
                            <div key={batchId} className="bg-surface/50 border border-zinc-800 rounded-xl overflow-hidden">
                                {/* Batch Header */}
                                <button
                                    onClick={() => toggleBatch(batchId)}
                                    className="w-full px-5 py-4 flex items-center justify-between hover:bg-zinc-800/30 transition-colors"
                                >
                                    <div className="flex items-center gap-4">
                                        {/* Preview thumbnails */}
                                        <div className="flex -space-x-3">
                                            {items.slice(0, 4).map((item: any, idx: number) => (
                                                <div
                                                    key={item.id}
                                                    className="w-10 h-10 rounded-lg border-2 border-zinc-800 overflow-hidden bg-black"
                                                    style={{ zIndex: 4 - idx }}
                                                >
                                                    <img
                                                        src={item.image_url}
                                                        className="w-full h-full object-cover"
                                                        loading="lazy"
                                                    />
                                                </div>
                                            ))}
                                            {items.length > 4 && (
                                                <div
                                                    className="w-10 h-10 rounded-lg border-2 border-zinc-800 bg-zinc-900 flex items-center justify-center text-xs text-zinc-400 font-medium"
                                                    style={{ zIndex: 0 }}
                                                >
                                                    +{items.length - 4}
                                                </div>
                                            )}
                                        </div>

                                        <div className="text-left">
                                            <div className="flex items-center gap-2">
                                                <span className="text-sm font-medium text-white">
                                                    Batch {batchId.slice(0, 8)}
                                                </span>
                                                <span className="px-2 py-0.5 bg-indigo-600/20 text-indigo-400 text-xs rounded-full">
                                                    {items.length} image{items.length !== 1 ? 's' : ''}
                                                </span>
                                            </div>
                                            <span className="text-xs text-zinc-500">{displayDate}</span>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-3">
                                        <span className="text-xs text-zinc-500">
                                            {firstItem?.width}×{firstItem?.height}
                                        </span>
                                        {isExpanded ? (
                                            <ChevronUp className="w-5 h-5 text-zinc-500" />
                                        ) : (
                                            <ChevronDown className="w-5 h-5 text-zinc-500" />
                                        )}
                                    </div>
                                </button>

                                {/* Batch Content */}
                                {isExpanded && (
                                    <div className="px-5 pb-5 pt-2 border-t border-zinc-800/50">
                                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                                            {items.map((item: any) => (
                                                <div
                                                    key={item.id}
                                                    className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden group hover:border-indigo-500/50 hover:shadow-lg hover:shadow-indigo-500/10 transition-all cursor-pointer"
                                                    onClick={() => setSelectedImage(item)}
                                                >
                                                    <div className="aspect-square bg-black relative">
                                                        <img
                                                            src={item.image_url}
                                                            className="w-full h-full object-cover"
                                                            loading="lazy"
                                                        />
                                                        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-2">
                                                            <p className="text-white text-[10px] line-clamp-2">{item.prompt}</p>
                                                        </div>
                                                        {/* Zoom icon */}
                                                        <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                            <div className="w-7 h-7 rounded-full bg-black/60 backdrop-blur flex items-center justify-center">
                                                                <Sparkles className="w-3.5 h-3.5 text-white" />
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Image Detail Modal */}
            {selectedImage && (
                <div
                    className="fixed inset-0 bg-black/95 z-50 flex items-center justify-center p-4 md:p-8"
                    onClick={() => setSelectedImage(null)}
                >
                    {/* Close button */}
                    <button
                        className="absolute top-4 right-4 p-2 text-zinc-400 hover:text-white transition-colors z-10"
                        onClick={() => setSelectedImage(null)}
                    >
                        <X className="w-8 h-8" />
                    </button>

                    <div
                        className="bg-surface border border-zinc-800 rounded-2xl overflow-hidden max-w-6xl w-full max-h-[90vh] flex flex-col md:flex-row shadow-2xl"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Left: Image */}
                        <div className="md:w-2/3 bg-black flex items-center justify-center p-4 min-h-[300px] md:min-h-0 relative group">
                            {/* Navigation Buttons */}
                            <button
                                onClick={(e) => { e.stopPropagation(); handlePrev(); }}
                                className="absolute left-4 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/80 text-white p-2 rounded-full backdrop-blur-sm transition-all opacity-0 group-hover:opacity-100 disabled:opacity-0 z-20"
                                disabled={history.findIndex((i: any) => i.id === selectedImage?.id) <= 0}
                            >
                                <ChevronLeft className="w-8 h-8" />
                            </button>
                            <button
                                onClick={(e) => { e.stopPropagation(); handleNext(); }}
                                className="absolute right-4 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/80 text-white p-2 rounded-full backdrop-blur-sm transition-all opacity-0 group-hover:opacity-100 disabled:opacity-0 z-20"
                                disabled={history.findIndex((i: any) => i.id === selectedImage?.id) >= history.length - 1}
                            >
                                <ChevronRight className="w-8 h-8" />
                            </button>

                            {/* Prompt Number Badge */}
                            {selectedImage.prompt_number && (
                                <div className="absolute top-4 left-4 bg-indigo-600 text-white px-3 py-1.5 rounded-lg font-mono text-sm font-bold shadow-lg z-10">
                                    #{selectedImage.prompt_number}
                                </div>
                            )}
                            {/* Current Tag Badge */}
                            {selectedImage.tag && (
                                <div className={clsx(
                                    "absolute top-4 right-4 px-3 py-1.5 rounded-lg text-sm font-medium shadow-lg z-10",
                                    selectedImage.tag === 'accept' && "bg-green-600 text-white",
                                    selectedImage.tag === 'maybe' && "bg-yellow-600 text-white",
                                    selectedImage.tag === 'declined' && "bg-red-600 text-white"
                                )}>
                                    {selectedImage.tag === 'accept' && '✓ Accepted'}
                                    {selectedImage.tag === 'maybe' && '? Maybe'}
                                    {selectedImage.tag === 'declined' && '✗ Declined'}
                                </div>
                            )}
                            <img
                                src={selectedImage.image_url}
                                className="max-w-full max-h-[60vh] md:max-h-[80vh] object-contain rounded-lg"
                                alt="Generated image"
                            />
                        </div>

                        {/* Right: Details */}
                        <div className="md:w-1/3 p-6 overflow-y-auto border-t md:border-t-0 md:border-l border-zinc-800 bg-surface/80 max-h-[40vh] md:max-h-[80vh]">
                            <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                                <Sparkles className="w-5 h-5 text-indigo-400" />
                                Image Details
                                {selectedImage.prompt_number && (
                                    <span className="ml-auto text-sm font-mono bg-indigo-600/20 text-indigo-400 px-2 py-0.5 rounded">
                                        #{selectedImage.prompt_number}
                                    </span>
                                )}
                            </h3>

                            {/* Tag Buttons - Accept / Maybe / Declined */}
                            <div className="mb-6">
                                <label className="text-xs font-medium text-zinc-400 uppercase tracking-wider mb-2 block">
                                    Review
                                </label>
                                <div className="flex gap-2">
                                    <button
                                        onClick={async () => {
                                            await apiClient.patch(`/generations/${selectedImage.id}/tag`, { tag: 'accept' });
                                            setSelectedImage({ ...selectedImage, tag: 'accept' });
                                            setHistory(prev => prev.map(h => h.id === selectedImage.id ? { ...h, tag: 'accept' } : h));
                                        }}
                                        className={clsx(
                                            "flex-1 py-2.5 px-3 rounded-lg font-medium transition-all flex items-center justify-center gap-1",
                                            selectedImage.tag === 'accept'
                                                ? "bg-green-600 text-white ring-2 ring-green-400"
                                                : "bg-green-900/30 text-green-400 hover:bg-green-800/50 border border-green-800/50"
                                        )}
                                    >
                                        ✓ Accept
                                    </button>
                                    <button
                                        onClick={async () => {
                                            await apiClient.patch(`/generations/${selectedImage.id}/tag`, { tag: 'maybe' });
                                            setSelectedImage({ ...selectedImage, tag: 'maybe' });
                                            setHistory(prev => prev.map(h => h.id === selectedImage.id ? { ...h, tag: 'maybe' } : h));
                                        }}
                                        className={clsx(
                                            "flex-1 py-2.5 px-3 rounded-lg font-medium transition-all flex items-center justify-center gap-1",
                                            selectedImage.tag === 'maybe'
                                                ? "bg-yellow-600 text-white ring-2 ring-yellow-400"
                                                : "bg-yellow-900/30 text-yellow-400 hover:bg-yellow-800/50 border border-yellow-800/50"
                                        )}
                                    >
                                        ? Maybe
                                    </button>
                                    <button
                                        onClick={async () => {
                                            await apiClient.patch(`/generations/${selectedImage.id}/tag`, { tag: 'declined' });
                                            setSelectedImage({ ...selectedImage, tag: 'declined' });
                                            setHistory(prev => prev.map(h => h.id === selectedImage.id ? { ...h, tag: 'declined' } : h));
                                        }}
                                        className={clsx(
                                            "flex-1 py-2.5 px-3 rounded-lg font-medium transition-all flex items-center justify-center gap-1",
                                            selectedImage.tag === 'declined'
                                                ? "bg-red-600 text-white ring-2 ring-red-400"
                                                : "bg-red-900/30 text-red-400 hover:bg-red-800/50 border border-red-800/50"
                                        )}
                                    >
                                        ✗ Decline
                                    </button>
                                </div>
                            </div>

                            {/* Prompt Section - Original vs Enhanced */}
                            <div className="mb-6">
                                {selectedImage.original_prompt && selectedImage.enhanced_prompt ? (
                                    // Show side by side comparison when both exist
                                    <div className="space-y-3">
                                        <div>
                                            <label className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-2 block">
                                                Original Prompt
                                            </label>
                                            <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-3">
                                                <p className="text-sm text-zinc-400 leading-relaxed whitespace-pre-wrap">
                                                    {selectedImage.original_prompt}
                                                </p>
                                            </div>
                                        </div>
                                        <div>
                                            <label className="text-xs font-medium text-emerald-400 uppercase tracking-wider mb-2 block flex items-center gap-1">
                                                <Sparkles className="w-3 h-3" />
                                                Enhanced Prompt
                                            </label>
                                            <div className="bg-emerald-900/20 border border-emerald-800/30 rounded-lg p-3">
                                                <p className="text-sm text-zinc-200 leading-relaxed whitespace-pre-wrap">
                                                    {selectedImage.enhanced_prompt}
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    // Single prompt display (no enhancement)
                                    <>
                                        <label className="text-xs font-medium text-zinc-400 uppercase tracking-wider mb-2 block">
                                            Prompt
                                        </label>
                                        <div className="bg-zinc-900/80 border border-zinc-800 rounded-lg p-4">
                                            <p className="text-sm text-zinc-200 leading-relaxed whitespace-pre-wrap">
                                                {selectedImage.prompt}
                                            </p>
                                        </div>
                                    </>
                                )}
                            </div>

                            {/* Metadata Grid */}
                            <div className="grid grid-cols-2 gap-3 mb-6">
                                {selectedImage.prompt_number && (
                                    <div className="bg-indigo-900/30 border border-indigo-800/50 rounded-lg p-3">
                                        <label className="text-[10px] text-indigo-400 uppercase tracking-wider block mb-1">Prompt #</label>
                                        <span className="text-sm font-mono font-bold text-indigo-300">{selectedImage.prompt_number}</span>
                                    </div>
                                )}
                                <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-3">
                                    <label className="text-[10px] text-zinc-500 uppercase tracking-wider block mb-1">Dimensions</label>
                                    <span className="text-sm font-medium text-white">{selectedImage.width}×{selectedImage.height}</span>
                                </div>
                                <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-3">
                                    <label className="text-[10px] text-zinc-500 uppercase tracking-wider block mb-1">Seed</label>
                                    <span className="text-sm font-mono text-white">{selectedImage.seed || 'Random'}</span>
                                </div>
                                <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-3">
                                    <label className="text-[10px] text-zinc-500 uppercase tracking-wider block mb-1">Batch ID</label>
                                    <span className="text-sm font-mono text-indigo-400">{selectedImage.batch_id?.slice(0, 8) || 'N/A'}</span>
                                </div>
                                <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-3">
                                    <label className="text-[10px] text-zinc-500 uppercase tracking-wider block mb-1">Created</label>
                                    <span className="text-sm text-white">
                                        {new Date(selectedImage.created_at).toLocaleDateString('en-AU', {
                                            day: 'numeric',
                                            month: 'short'
                                        })}
                                    </span>
                                </div>
                                {selectedImage.guidance_scale && (
                                    <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-3">
                                        <label className="text-[10px] text-zinc-500 uppercase tracking-wider block mb-1">CFG</label>
                                        <span className="text-sm font-mono text-white">{selectedImage.guidance_scale}</span>
                                    </div>
                                )}
                            </div>

                            {/* Actions */}
                            <div className="flex flex-col gap-2">
                                <a
                                    href={selectedImage.image_url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white py-2.5 px-4 rounded-lg font-medium transition-colors"
                                >
                                    <Download className="w-4 h-4" />
                                    Download Image
                                </a>
                                <button
                                    onClick={() => {
                                        navigator.clipboard.writeText(selectedImage.prompt);
                                    }}
                                    className="flex items-center justify-center gap-2 bg-zinc-800 hover:bg-zinc-700 text-white py-2.5 px-4 rounded-lg font-medium transition-colors"
                                >
                                    <Layers className="w-4 h-4" />
                                    Copy Prompt
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

// Gallery View with sorting, filtering, and export
function GalleryView() {
    const [gallery, setGallery] = useState<any>({ items: [], total: 0, batches: [], tag_counts: {} });
    const [loading, setLoading] = useState(true);
    const [sortBy, setSortBy] = useState('created_at');
    const [sortOrder, setSortOrder] = useState('desc');
    const [tagFilter, setTagFilter] = useState('');
    const [batchFilter, setBatchFilter] = useState('');
    const [impFilter, setImpFilter] = useState('');
    const [page, setPage] = useState(0);

    const IMPORTANT_VARIANTS = [
        { label: "Summoning digital vines", value: "summoning_digital_vines" },
        { label: "Holding two coins fused", value: "holding_two_coins_fused" },
        { label: "Wearing an amulet", value: "wearing_an_amulet" },
        { label: "Raising a cube", value: "raising_a_cube" },
        { label: "Cradling a miniature world", value: "cradling_a_miniature_world" },
        { label: "Holding a holographic display", value: "holding_a_holographic_display" },
        { label: "Holding a staff", value: "holding_a_staff" },
        { label: "Grasping a coin", value: "grasping_a_coin" },
        { label: "Holding a glowing seed", value: "holding_a_glowing_seed" },
        { label: "Cradling a glowing acorn", value: "cradling_a_glowing_acorn" },
        { label: "Raising a golden token", value: "raising_a_golden_token" },
        { label: "Holding up a circular item", value: "holding_up_a_circular_item" }
    ];
    const [selectedImage, setSelectedImage] = useState<any | null>(null);
    const pageSize = 50;

    // Navigation Logic
    const handleNext = useCallback(() => {
        if (!selectedImage || !gallery.items.length) return;
        const currentIndex = gallery.items.findIndex((item: any) => item.id === selectedImage.id);
        if (currentIndex !== -1 && currentIndex < gallery.items.length - 1) {
            setSelectedImage(gallery.items[currentIndex + 1]);
        }
    }, [selectedImage, gallery.items]);

    const handlePrev = useCallback(() => {
        if (!selectedImage || !gallery.items.length) return;
        const currentIndex = gallery.items.findIndex((item: any) => item.id === selectedImage.id);
        if (currentIndex !== -1 && currentIndex > 0) {
            setSelectedImage(gallery.items[currentIndex - 1]);
        }
    }, [selectedImage, gallery.items]);

    // Keyboard Navigation
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (!selectedImage) return;

            if (e.key === 'ArrowLeft') {
                handlePrev();
            } else if (e.key === 'ArrowRight') {
                handleNext();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [selectedImage, handleNext, handlePrev]);

    const fetchGallery = async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams({
                sort_by: sortBy,
                sort_order: sortOrder,
                limit: String(pageSize),
                offset: String(page * pageSize)
            });
            if (tagFilter) params.append('tag', tagFilter);
            if (batchFilter) params.append('batch', batchFilter);
            if (impFilter) params.append('imp', impFilter);

            const res = await apiClient.get(`/gallery?${params.toString()}`);
            setGallery(res.data);
        } catch (e) {
            console.error('Failed to fetch gallery:', e);
        } finally {
            setLoading(false);
        }
    };

    const handleSync = async () => {
        if (!confirm("This will fetch all generations from Leonardo.ai from the last 60 days. Continue?")) return;
        setLoading(true);
        try {
            const apiKey = getApiKey();
            // Sync last 60 days of history, safety limit 5000 images
            await apiClient.post('/generations/sync', { apiKey, limit: 5000, days: 60 });
            await fetchGallery();
            alert('Sync complete! Note: Images are synced by date (newest first).');
        } catch (e) {
            console.error('Sync failed:', e);
            alert('Sync failed. Check console for details.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchGallery();
    }, [sortBy, sortOrder, tagFilter, batchFilter, impFilter, page]);

    const handleExport = async (format: 'csv' | 'zip') => {
        const params = new URLSearchParams({ format });
        if (tagFilter) params.append('tag', tagFilter);
        if (batchFilter) params.append('batch', batchFilter);
        if (impFilter) params.append('imp', impFilter);

        window.open(`http://localhost:8000/api/v1/export?${params.toString()}`, '_blank');
    };

    const handleTag = async (id: string, tag: string) => {
        await apiClient.patch(`/generations/${id}/tag`, { tag });
        setGallery((prev: any) => ({
            ...prev,
            items: prev.items.map((item: any) => item.id === id ? { ...item, tag } : item)
        }));
        if (selectedImage?.id === id) {
            setSelectedImage({ ...selectedImage, tag });
        }
    };

    const totalPages = Math.ceil(gallery.total / pageSize);

    if (loading && gallery.items.length === 0) {
        return <div className="p-8 text-center text-zinc-500">Loading gallery...</div>;
    }

    return (
        <div className="p-6 h-full overflow-y-auto">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h2 className="text-2xl font-bold">Gallery</h2>
                    <p className="text-sm text-zinc-500 mt-1">
                        {gallery.total} images • Filter and export your generations
                    </p>
                </div>

                {/* Export Buttons */}
                <div className="flex gap-2">
                    <button
                        onClick={handleSync}
                        disabled={loading}
                        className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-medium transition-colors flex items-center gap-2"
                    >
                        <RefreshCw className={clsx("w-4 h-4", loading && "animate-spin")} />
                        Sync
                    </button>
                    <button
                        onClick={() => handleExport('csv')}
                        className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg font-medium transition-colors flex items-center gap-2"
                    >
                        <Download className="w-4 h-4" />
                        Export CSV
                    </button>
                    <button
                        onClick={() => handleExport('zip')}
                        className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-medium transition-colors flex items-center gap-2"
                    >
                        <Download className="w-4 h-4" />
                        Export ZIP
                    </button>
                </div>
            </div>

            {/* Filters & Sorting */}
            <div className="flex flex-wrap gap-4 mb-6 p-4 bg-surface border border-zinc-800 rounded-xl">
                {/* Sort By */}
                <div className="flex flex-col gap-1">
                    <label className="text-xs text-zinc-500 uppercase tracking-wider">Sort By</label>
                    <select
                        value={sortBy}
                        onChange={(e) => { setSortBy(e.target.value); setPage(0); }}
                        className="bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    >
                        <option value="created_at">Date</option>
                        <option value="prompt_number">Prompt #</option>
                        <option value="seed">Seed</option>
                        <option value="batch_id">Batch</option>
                        <option value="tag">Tag</option>
                    </select>
                </div>

                {/* Sort Order */}
                <div className="flex flex-col gap-1">
                    <label className="text-xs text-zinc-500 uppercase tracking-wider">Order</label>
                    <select
                        value={sortOrder}
                        onChange={(e) => { setSortOrder(e.target.value); setPage(0); }}
                        className="bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    >
                        <option value="desc">Newest First</option>
                        <option value="asc">Oldest First</option>
                    </select>
                </div>

                {/* Tag Filter */}
                <div className="flex flex-col gap-1">
                    <label className="text-xs text-zinc-500 uppercase tracking-wider">Tag</label>
                    <select
                        value={tagFilter}
                        onChange={(e) => { setTagFilter(e.target.value); setPage(0); }}
                        className="bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    >
                        <option value="">All Tags</option>
                        <option value="accept">✓ Accepted ({gallery.tag_counts?.accept || 0})</option>
                        <option value="maybe">? Maybe ({gallery.tag_counts?.maybe || 0})</option>
                        <option value="declined">✗ Declined ({gallery.tag_counts?.declined || 0})</option>
                        <option value="untagged">Untagged ({gallery.tag_counts?.untagged || 0})</option>
                    </select>
                </div>

                {/* Batch Filter */}
                <div className="flex flex-col gap-1">
                    <label className="text-xs text-zinc-500 uppercase tracking-wider">Batch</label>
                    <select
                        value={batchFilter}
                        onChange={(e) => { setBatchFilter(e.target.value); setPage(0); }}
                        className="bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none max-w-[150px]"
                    >
                        <option value="">All Batches</option>
                        {gallery.batches?.map((batch: string) => (
                            <option key={batch} value={batch}>{batch.slice(0, 8)}</option>
                        ))}
                    </select>
                </div>

                {/* IMP Filter */}
                <div className="flex flex-col gap-1">
                    <label className="text-xs text-zinc-500 uppercase tracking-wider">Variant</label>
                    <select
                        value={impFilter}
                        onChange={(e) => { setImpFilter(e.target.value); setPage(0); }}
                        className="bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none max-w-[150px]"
                    >
                        <option value="">All Variants</option>
                        {IMPORTANT_VARIANTS.map(v => (
                            <option key={v.value} value={v.value}>{v.label}</option>
                        ))}
                    </select>
                </div>

                {/* Clear Filters */}
                {(tagFilter || batchFilter || impFilter) && (
                    <button
                        onClick={() => { setTagFilter(''); setBatchFilter(''); setImpFilter(''); setPage(0); }}
                        className="self-end px-3 py-2 text-sm text-zinc-400 hover:text-white transition-colors"
                    >
                        Clear Filters
                    </button>
                )}
            </div>

            {/* Tag Summary Cards */}
            <div className="grid grid-cols-4 gap-4 mb-6">
                <div
                    onClick={() => { setTagFilter('accept'); setPage(0); }}
                    className={clsx(
                        "p-4 rounded-xl border cursor-pointer transition-all",
                        tagFilter === 'accept'
                            ? "bg-green-900/30 border-green-600"
                            : "bg-surface border-zinc-800 hover:border-green-600/50"
                    )}
                >
                    <div className="text-2xl font-bold text-green-400">{gallery.tag_counts?.accept || 0}</div>
                    <div className="text-sm text-zinc-400">Accepted</div>
                </div>
                <div
                    onClick={() => { setTagFilter('maybe'); setPage(0); }}
                    className={clsx(
                        "p-4 rounded-xl border cursor-pointer transition-all",
                        tagFilter === 'maybe'
                            ? "bg-yellow-900/30 border-yellow-600"
                            : "bg-surface border-zinc-800 hover:border-yellow-600/50"
                    )}
                >
                    <div className="text-2xl font-bold text-yellow-400">{gallery.tag_counts?.maybe || 0}</div>
                    <div className="text-sm text-zinc-400">Maybe</div>
                </div>
                <div
                    onClick={() => { setTagFilter('declined'); setPage(0); }}
                    className={clsx(
                        "p-4 rounded-xl border cursor-pointer transition-all",
                        tagFilter === 'declined'
                            ? "bg-red-900/30 border-red-600"
                            : "bg-surface border-zinc-800 hover:border-red-600/50"
                    )}
                >
                    <div className="text-2xl font-bold text-red-400">{gallery.tag_counts?.declined || 0}</div>
                    <div className="text-sm text-zinc-400">Declined</div>
                </div>
                <div
                    onClick={() => { setTagFilter('untagged'); setPage(0); }}
                    className={clsx(
                        "p-4 rounded-xl border cursor-pointer transition-all",
                        tagFilter === 'untagged'
                            ? "bg-zinc-700/30 border-zinc-500"
                            : "bg-surface border-zinc-800 hover:border-zinc-600"
                    )}
                >
                    <div className="text-2xl font-bold text-zinc-300">{gallery.tag_counts?.untagged || 0}</div>
                    <div className="text-sm text-zinc-400">Untagged</div>
                </div>
            </div>

            {/* Image Grid */}
            {gallery.items.length === 0 ? (
                <div className="text-center py-16 text-zinc-500">
                    <p>No images found matching filters</p>
                </div>
            ) : (
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-3">
                    {gallery.items.map((item: any) => (
                        <div
                            key={item.id}
                            onClick={() => setSelectedImage(item)}
                            className="relative group cursor-pointer rounded-lg overflow-hidden border border-zinc-800 hover:border-indigo-500 transition-all"
                        >
                            {/* Image */}
                            <div className="aspect-square bg-black">
                                <img
                                    src={item.image_url}
                                    className="w-full h-full object-cover"
                                    loading="lazy"
                                />
                            </div>

                            {/* Prompt Number Badge */}
                            {item.prompt_number && (
                                <div className="absolute top-1 left-1 bg-indigo-600/90 text-white px-1.5 py-0.5 rounded text-xs font-mono font-bold">
                                    #{item.prompt_number}
                                </div>
                            )}

                            {/* Tag Badge */}
                            {item.tag && (
                                <div className={clsx(
                                    "absolute top-1 right-1 px-1.5 py-0.5 rounded text-xs font-medium",
                                    item.tag === 'accept' && "bg-green-600 text-white",
                                    item.tag === 'maybe' && "bg-yellow-600 text-white",
                                    item.tag === 'declined' && "bg-red-600 text-white"
                                )}>
                                    {item.tag === 'accept' && '✓'}
                                    {item.tag === 'maybe' && '?'}
                                    {item.tag === 'declined' && '✗'}
                                </div>
                            )}

                            {/* Hover overlay with quick actions */}
                            <div className="absolute inset-0 bg-black/70 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-1 p-2">
                                <div className="flex gap-1">
                                    <button
                                        onClick={(e) => { e.stopPropagation(); handleTag(item.id, 'accept'); }}
                                        className={clsx(
                                            "p-1.5 rounded transition-colors",
                                            item.tag === 'accept' ? "bg-green-600" : "bg-green-900/50 hover:bg-green-700"
                                        )}
                                    >
                                        <span className="text-white text-xs">✓</span>
                                    </button>
                                    <button
                                        onClick={(e) => { e.stopPropagation(); handleTag(item.id, 'maybe'); }}
                                        className={clsx(
                                            "p-1.5 rounded transition-colors",
                                            item.tag === 'maybe' ? "bg-yellow-600" : "bg-yellow-900/50 hover:bg-yellow-700"
                                        )}
                                    >
                                        <span className="text-white text-xs">?</span>
                                    </button>
                                    <button
                                        onClick={(e) => { e.stopPropagation(); handleTag(item.id, 'declined'); }}
                                        className={clsx(
                                            "p-1.5 rounded transition-colors",
                                            item.tag === 'declined' ? "bg-red-600" : "bg-red-900/50 hover:bg-red-700"
                                        )}
                                    >
                                        <span className="text-white text-xs">✗</span>
                                    </button>
                                </div>
                                <span className="text-[10px] text-zinc-400 truncate max-w-full px-1">
                                    {item.prompt?.slice(0, 30)}...
                                </span>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Pagination */}
            {totalPages > 1 && (
                <div className="flex items-center justify-center gap-4 mt-6 py-4">
                    <button
                        onClick={() => setPage(Math.max(0, page - 1))}
                        disabled={page === 0}
                        className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors"
                    >
                        Previous
                    </button>
                    <span className="text-zinc-400">
                        Page {page + 1} of {totalPages}
                    </span>
                    <button
                        onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
                        disabled={page >= totalPages - 1}
                        className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors"
                    >
                        Next
                    </button>
                </div>
            )}

            {/* Image Detail Modal (same as ResultsView) */}
            {selectedImage && (
                <div
                    className="fixed inset-0 bg-black/95 z-50 flex items-center justify-center p-4 md:p-8"
                    onClick={() => setSelectedImage(null)}
                >
                    <button
                        className="absolute top-4 right-4 p-2 text-zinc-400 hover:text-white transition-colors z-10"
                        onClick={() => setSelectedImage(null)}
                    >
                        <X className="w-8 h-8" />
                    </button>

                    <div
                        className="bg-surface border border-zinc-800 rounded-2xl overflow-hidden max-w-6xl w-full max-h-[90vh] flex flex-col md:flex-row shadow-2xl"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="md:w-2/3 bg-black flex items-center justify-center p-4 min-h-[300px] md:min-h-0 relative group">
                            {/* Navigation Buttons */}
                            <button
                                onClick={(e) => { e.stopPropagation(); handlePrev(); }}
                                className="absolute left-4 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/80 text-white p-2 rounded-full backdrop-blur-sm transition-all opacity-0 group-hover:opacity-100 disabled:opacity-0 z-20"
                                disabled={gallery.items.findIndex((i: any) => i.id === selectedImage?.id) <= 0}
                            >
                                <ChevronLeft className="w-8 h-8" />
                            </button>
                            <button
                                onClick={(e) => { e.stopPropagation(); handleNext(); }}
                                className="absolute right-4 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/80 text-white p-2 rounded-full backdrop-blur-sm transition-all opacity-0 group-hover:opacity-100 disabled:opacity-0 z-20"
                                disabled={gallery.items.findIndex((i: any) => i.id === selectedImage?.id) >= gallery.items.length - 1}
                            >
                                <ChevronRight className="w-8 h-8" />
                            </button>
                            {selectedImage.prompt_number && (
                                <div className="absolute top-4 left-4 bg-indigo-600 text-white px-3 py-1.5 rounded-lg font-mono text-sm font-bold shadow-lg">
                                    #{selectedImage.prompt_number}
                                </div>
                            )}
                            {selectedImage.tag && (
                                <div className={clsx(
                                    "absolute top-4 right-4 px-3 py-1.5 rounded-lg text-sm font-medium shadow-lg",
                                    selectedImage.tag === 'accept' && "bg-green-600 text-white",
                                    selectedImage.tag === 'maybe' && "bg-yellow-600 text-white",
                                    selectedImage.tag === 'declined' && "bg-red-600 text-white"
                                )}>
                                    {selectedImage.tag === 'accept' && '✓ Accepted'}
                                    {selectedImage.tag === 'maybe' && '? Maybe'}
                                    {selectedImage.tag === 'declined' && '✗ Declined'}
                                </div>
                            )}
                            <img
                                src={selectedImage.image_url}
                                className="max-w-full max-h-[60vh] md:max-h-[80vh] object-contain rounded-lg"
                                alt="Generated image"
                            />
                        </div>

                        <div className="md:w-1/3 p-6 overflow-y-auto border-t md:border-t-0 md:border-l border-zinc-800 bg-surface/80 max-h-[40vh] md:max-h-[80vh]">
                            <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                                <Sparkles className="w-5 h-5 text-indigo-400" />
                                Image Details
                            </h3>

                            {/* Tag Buttons */}
                            <div className="mb-6">
                                <label className="text-xs font-medium text-zinc-400 uppercase tracking-wider mb-2 block">Review</label>
                                <div className="flex gap-2">
                                    {['accept', 'maybe', 'declined'].map((tag) => (
                                        <button
                                            key={tag}
                                            onClick={() => handleTag(selectedImage.id, tag)}
                                            className={clsx(
                                                "flex-1 py-2.5 px-3 rounded-lg font-medium transition-all",
                                                selectedImage.tag === tag
                                                    ? tag === 'accept' ? "bg-green-600 text-white ring-2 ring-green-400"
                                                        : tag === 'maybe' ? "bg-yellow-600 text-white ring-2 ring-yellow-400"
                                                            : "bg-red-600 text-white ring-2 ring-red-400"
                                                    : tag === 'accept' ? "bg-green-900/30 text-green-400 hover:bg-green-800/50 border border-green-800/50"
                                                        : tag === 'maybe' ? "bg-yellow-900/30 text-yellow-400 hover:bg-yellow-800/50 border border-yellow-800/50"
                                                            : "bg-red-900/30 text-red-400 hover:bg-red-800/50 border border-red-800/50"
                                            )}
                                        >
                                            {tag === 'accept' ? '✓ Accept' : tag === 'maybe' ? '? Maybe' : '✗ Decline'}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Prompt - Original vs Enhanced */}
                            <div className="mb-6">
                                {selectedImage.original_prompt && selectedImage.enhanced_prompt ? (
                                    <div className="space-y-3">
                                        <div>
                                            <label className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-2 block">
                                                Original Prompt
                                            </label>
                                            <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-3">
                                                <p className="text-sm text-zinc-400 leading-relaxed whitespace-pre-wrap">
                                                    {selectedImage.original_prompt}
                                                </p>
                                            </div>
                                        </div>
                                        <div>
                                            <label className="text-xs font-medium text-emerald-400 uppercase tracking-wider mb-2 block flex items-center gap-1">
                                                <Sparkles className="w-3 h-3" />
                                                Enhanced Prompt
                                            </label>
                                            <div className="bg-emerald-900/20 border border-emerald-800/30 rounded-lg p-3">
                                                <p className="text-sm text-zinc-200 leading-relaxed whitespace-pre-wrap">
                                                    {selectedImage.enhanced_prompt}
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    <>
                                        <label className="text-xs font-medium text-zinc-400 uppercase tracking-wider mb-2 block">Prompt</label>
                                        <div className="bg-zinc-900/80 border border-zinc-800 rounded-lg p-4">
                                            <p className="text-sm text-zinc-200 leading-relaxed whitespace-pre-wrap">{selectedImage.prompt}</p>
                                        </div>
                                    </>
                                )}
                            </div>

                            {/* Metadata */}
                            <div className="grid grid-cols-2 gap-3 mb-6">
                                {selectedImage.prompt_number && (
                                    <div className="bg-indigo-900/30 border border-indigo-800/50 rounded-lg p-3">
                                        <label className="text-[10px] text-indigo-400 uppercase block mb-1">Prompt #</label>
                                        <span className="text-sm font-mono font-bold text-indigo-300">{selectedImage.prompt_number}</span>
                                    </div>
                                )}
                                <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-3">
                                    <label className="text-[10px] text-zinc-500 uppercase block mb-1">Seed</label>
                                    <span className="text-sm font-mono text-white">{selectedImage.seed || 'Random'}</span>
                                </div>
                                <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-3">
                                    <label className="text-[10px] text-zinc-500 uppercase block mb-1">Batch</label>
                                    <span className="text-sm font-mono text-indigo-400">{selectedImage.batch_id?.slice(0, 8)}</span>
                                </div>
                                <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-3">
                                    <label className="text-[10px] text-zinc-500 uppercase block mb-1">Size</label>
                                    <span className="text-sm text-white">{selectedImage.width}×{selectedImage.height}</span>
                                </div>
                            </div>

                            {/* Actions */}
                            <div className="flex flex-col gap-2">
                                <a
                                    href={selectedImage.image_url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white py-2.5 px-4 rounded-lg font-medium transition-colors"
                                >
                                    <Download className="w-4 h-4" />
                                    Download Image
                                </a>
                                <button
                                    onClick={() => navigator.clipboard.writeText(selectedImage.prompt)}
                                    className="flex items-center justify-center gap-2 bg-zinc-800 hover:bg-zinc-700 text-white py-2.5 px-4 rounded-lg font-medium transition-colors"
                                >
                                    <Layers className="w-4 h-4" />
                                    Copy Prompt
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

// Prompt Studio - Bulk upload and enhance prompts
function PromptStudioView() {
    const [rawPrompts, setRawPrompts] = useState('');
    const [stylePhrases, setStylePhrases] = useState('');
    const [enhancedResults, setEnhancedResults] = useState<any[]>([]);
    const [isEnhancing, setIsEnhancing] = useState(false);
    const [copiedIdx, setCopiedIdx] = useState<number | null>(null);

    const handleEnhance = async () => {
        const openaiKey = getOpenAIKey();
        const model = getOpenAIModel();

        if (!openaiKey) {
            alert('Please configure your OpenAI API key in Settings first.');
            return;
        }

        const lines = rawPrompts.split('\n').filter(line => line.trim());
        if (lines.length === 0) {
            alert('Please enter some prompts to enhance.');
            return;
        }

        setIsEnhancing(true);
        setEnhancedResults([]);

        try {
            const response = await apiClient.post('/enhance-prompts', {
                prompts: lines,
                style_phrases: stylePhrases.trim() || null,
                openai_api_key: openaiKey,
                model: model
            });

            setEnhancedResults(response.data.results);
        } catch (e: any) {
            console.error('Enhancement failed:', e);
            alert('Enhancement failed: ' + (e.response?.data?.detail || e.message));
        } finally {
            setIsEnhancing(false);
        }
    };

    const copyToClipboard = (text: string, idx: number) => {
        navigator.clipboard.writeText(text);
        setCopiedIdx(idx);
        setTimeout(() => setCopiedIdx(null), 2000);
    };

    const copyAllEnhanced = () => {
        const enhanced = enhancedResults
            .filter(r => r.formatted_enhanced)
            .map(r => r.formatted_enhanced)
            .join('\n');
        navigator.clipboard.writeText(enhanced);
        alert(`Copied ${enhancedResults.filter(r => r.enhanced).length} enhanced prompts to clipboard!`);
    };

    const downloadAsText = () => {
        // Create CSV with 4 columns: Number, Original Prompt, Number, Enhanced Prompt
        const escapeCSV = (text: string) => {
            if (!text) return '';
            // Escape double quotes and wrap in quotes if contains comma, newline, or quotes
            if (text.includes(',') || text.includes('\n') || text.includes('"')) {
                return `"${text.replace(/"/g, '""')}"`;
            }
            return text;
        };

        const header = 'Number,Original Prompt,Number,Enhanced Prompt';
        const rows = enhancedResults
            .filter(r => r.enhanced)
            .map(r => {
                const num = r.prompt_number || '';
                const original = escapeCSV(r.original || '');
                const enhanced = escapeCSV(r.enhanced || '');
                return `${num},${original},${num},${enhanced}`;
            });

        const csvContent = [header, ...rows].join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `enhanced_prompts_${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    return (
        <div className="h-full flex">
            {/* Left: Input Panel */}
            <div className="w-1/2 border-r border-zinc-800 p-6 flex flex-col gap-6 overflow-y-auto">
                <div>
                    <h2 className="text-2xl font-bold flex items-center gap-2">
                        <Wand2 className="w-6 h-6 text-indigo-400" />
                        Prompt Studio
                    </h2>
                    <p className="text-sm text-zinc-500 mt-1">
                        Bulk upload and enhance prompts with AI. Preserves numbering and context.
                    </p>
                </div>

                {/* Raw Prompts Input */}
                <div className="flex-1 flex flex-col gap-2">
                    <label className="text-sm font-medium text-zinc-400 flex items-center gap-2">
                        Bulk Prompts
                        <span className="text-xs text-zinc-600">(one per line, optional [number] prefix)</span>
                    </label>
                    <textarea
                        value={rawPrompts}
                        onChange={(e) => setRawPrompts(e.target.value)}
                        className="flex-1 bg-zinc-950 border border-zinc-800 rounded-lg p-4 font-mono text-sm resize-none focus:ring-2 focus:ring-indigo-500 focus:outline-none min-h-[250px]"
                        placeholder={`[001] A majestic lion standing on a cliff at sunset
[002] A futuristic city with flying cars and neon lights
[003] A medieval castle surrounded by a moat
...`}
                    />
                    <div className="text-xs text-zinc-600">
                        {rawPrompts.split('\n').filter(l => l.trim()).length} prompts entered
                    </div>
                </div>

                {/* Style Phrases */}
                <div className="flex flex-col gap-2">
                    <label className="text-sm font-medium text-zinc-400 flex items-center gap-2">
                        Style Phrases
                        <InfoTip text="Add style keywords or phrases that should be incorporated into all prompts. E.g., 'cinematic lighting, 8K, photorealistic, dramatic composition'" />
                    </label>
                    <textarea
                        value={stylePhrases}
                        onChange={(e) => setStylePhrases(e.target.value)}
                        className="bg-zinc-950 border border-zinc-800 rounded-lg p-4 text-sm resize-none focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                        rows={3}
                        placeholder="cinematic lighting, 8K resolution, photorealistic, dramatic composition, ultra detailed..."
                    />
                </div>

                {/* Enhance Button */}
                <button
                    onClick={handleEnhance}
                    disabled={isEnhancing || !rawPrompts.trim()}
                    className="bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white py-3 px-6 rounded-lg font-semibold transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {isEnhancing ? (
                        <>
                            <Loader2 className="w-5 h-5 animate-spin" />
                            Enhancing...
                        </>
                    ) : (
                        <>
                            <Wand2 className="w-5 h-5" />
                            Enhance Prompts
                        </>
                    )}
                </button>
            </div>

            {/* Right: Results Panel */}
            <div className="w-1/2 p-6 flex flex-col gap-4 overflow-y-auto bg-surface/30">
                <div className="flex items-center justify-between">
                    <h3 className="text-lg font-semibold">
                        Enhanced Results
                        {enhancedResults.length > 0 && (
                            <span className="ml-2 text-sm font-normal text-zinc-500">
                                ({enhancedResults.filter(r => r.enhanced).length} successful)
                            </span>
                        )}
                    </h3>

                    {enhancedResults.length > 0 && (
                        <div className="flex gap-2">
                            <button
                                onClick={copyAllEnhanced}
                                className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-sm flex items-center gap-1"
                            >
                                <Copy className="w-4 h-4" />
                                Copy All
                            </button>
                            <button
                                onClick={downloadAsText}
                                className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-sm flex items-center gap-1"
                            >
                                <Download className="w-4 h-4" />
                                Download
                            </button>
                        </div>
                    )}
                </div>

                {enhancedResults.length === 0 ? (
                    <div className="flex-1 flex items-center justify-center">
                        <div className="text-center text-zinc-600">
                            <Wand2 className="w-12 h-12 mx-auto mb-4 opacity-30" />
                            <p>Enhanced prompts will appear here</p>
                            <p className="text-sm mt-2">Enter prompts and click "Enhance Prompts"</p>
                        </div>
                    </div>
                ) : (
                    <div className="flex flex-col gap-4">
                        {enhancedResults.map((result, idx) => (
                            <div
                                key={idx}
                                className={clsx(
                                    "bg-surface border rounded-xl p-4 transition-all",
                                    result.error ? "border-red-800/50" : "border-zinc-800"
                                )}
                            >
                                {/* Prompt Number Badge */}
                                {result.prompt_number && (
                                    <div className="mb-3 flex items-center gap-2">
                                        <span className="bg-indigo-600 text-white px-2 py-0.5 rounded font-mono text-sm font-bold">
                                            #{result.prompt_number}
                                        </span>
                                        {result.error && (
                                            <span className="bg-red-600 text-white px-2 py-0.5 rounded text-xs">
                                                Failed
                                            </span>
                                        )}
                                    </div>
                                )}

                                {result.error ? (
                                    <div className="text-red-400 text-sm">
                                        <p className="font-medium">Error:</p>
                                        <p>{result.error}</p>
                                        <p className="mt-2 text-zinc-400">Original: {result.original}</p>
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-2 gap-4">
                                        {/* Original */}
                                        <div>
                                            <label className="text-xs text-zinc-500 uppercase tracking-wider block mb-2">
                                                Original
                                            </label>
                                            <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-3 text-sm text-zinc-300 min-h-[80px]">
                                                {result.formatted_original}
                                            </div>
                                        </div>

                                        {/* Enhanced */}
                                        <div>
                                            <label className="text-xs text-emerald-400 uppercase tracking-wider block mb-2 flex items-center gap-1">
                                                <Sparkles className="w-3 h-3" />
                                                Enhanced
                                            </label>
                                            <div className="bg-emerald-900/20 border border-emerald-800/30 rounded-lg p-3 text-sm text-zinc-200 min-h-[80px] relative group">
                                                {result.formatted_enhanced}
                                                <button
                                                    onClick={() => copyToClipboard(result.formatted_enhanced, idx)}
                                                    className="absolute top-2 right-2 p-1.5 bg-zinc-800/80 hover:bg-emerald-600 rounded opacity-0 group-hover:opacity-100 transition-all"
                                                    title="Copy enhanced prompt"
                                                >
                                                    {copiedIdx === idx ? (
                                                        <Check className="w-3 h-3 text-green-400" />
                                                    ) : (
                                                        <Copy className="w-3 h-3" />
                                                    )}
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

// Prompt Classification Tool - 12-Group Taxonomy
function ClassifierView() {
    const [file, setFile] = useState<File | null>(null);
    const [isClassifying, setIsClassifying] = useState(false);
    const [results, setResults] = useState<any[]>([]);
    const [summary, setSummary] = useState<any>(null);
    const [error, setError] = useState<string | null>(null);
    const [selectedGroup, setSelectedGroup] = useState<number | null>(null);

    const groupLabels: Record<number, { chest: string; cape: string; arborist: string; color: string }> = {
        1: { chest: 'SUI', cape: 'Cape', arborist: 'Arborist', color: 'bg-blue-600' },
        2: { chest: 'SUI', cape: 'Cape', arborist: 'Standard', color: 'bg-blue-500' },
        3: { chest: 'SUI', cape: 'No Cape', arborist: 'Standard', color: 'bg-blue-400' },
        4: { chest: 'Gem', cape: 'Cape', arborist: 'Arborist', color: 'bg-purple-600' },
        5: { chest: 'Gem', cape: 'Cape', arborist: 'Standard', color: 'bg-purple-500' },
        6: { chest: 'Gem', cape: 'No Cape', arborist: 'Standard', color: 'bg-purple-400' },
        7: { chest: 'Tree', cape: 'Cape', arborist: 'Arborist', color: 'bg-green-600' },
        8: { chest: 'Tree', cape: 'Cape', arborist: 'Standard', color: 'bg-green-500' },
        9: { chest: 'Tree', cape: 'No Cape', arborist: 'Standard', color: 'bg-green-400' },
        10: { chest: 'Star', cape: 'Cape', arborist: 'Arborist', color: 'bg-yellow-600' },
        11: { chest: 'Star', cape: 'Cape', arborist: 'Standard', color: 'bg-yellow-500' },
        12: { chest: 'Star', cape: 'No Cape', arborist: 'Standard', color: 'bg-yellow-400' },
    };

    const handleClassify = async () => {
        if (!file) {
            setError('Please select a CSV file first.');
            return;
        }

        setIsClassifying(true);
        setError(null);
        setResults([]);
        setSummary(null);

        try {
            const formData = new FormData();
            formData.append('file', file);

            const response = await fetch('http://localhost:8000/api/v1/classify-prompts', {
                method: 'POST',
                body: formData
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.detail || 'Classification failed');
            }

            const data = await response.json();
            setResults(data.results);
            setSummary(data.summary);
        } catch (e: any) {
            setError(e.message || 'Classification failed');
        } finally {
            setIsClassifying(false);
        }
    };

    const handleDownload = async () => {
        if (!file) return;

        const formData = new FormData();
        formData.append('file', file);

        try {
            const response = await fetch('http://localhost:8000/api/v1/classify-prompts/download', {
                method: 'POST',
                body: formData
            });

            if (!response.ok) throw new Error('Download failed');

            const blob = await response.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `classified_prompts_${new Date().toISOString().slice(0, 10)}.csv`;
            a.click();
            URL.revokeObjectURL(url);
        } catch (e: any) {
            setError(e.message || 'Download failed');
        }
    };

    const filteredResults = selectedGroup !== null
        ? results.filter(r => r.group === selectedGroup)
        : results;

    return (
        <div className="h-full flex">
            {/* Left Panel - Upload & Config */}
            <div className="w-[400px] border-r border-zinc-800 p-6 overflow-y-auto bg-surface/20">
                <div className="flex items-center gap-3 mb-6">
                    <FileSpreadsheet className="w-6 h-6 text-indigo-400" />
                    <h2 className="text-lg font-semibold">Prompt Classifier</h2>
                </div>

                <p className="text-sm text-zinc-400 mb-6">
                    Upload a CSV with <code className="px-1 py-0.5 bg-zinc-800 rounded text-xs">Number</code> and{' '}
                    <code className="px-1 py-0.5 bg-zinc-800 rounded text-xs">Prompt</code> columns to classify prompts into 12 groups.
                </p>

                {/* File Upload */}
                <div className="space-y-4">
                    <div className="border-2 border-dashed border-zinc-800 rounded-lg p-6 text-center hover:border-zinc-700 transition cursor-pointer relative">
                        <input
                            type="file"
                            accept=".csv"
                            onChange={e => {
                                if (e.target.files?.[0]) {
                                    setFile(e.target.files[0]);
                                    setError(null);
                                    setResults([]);
                                    setSummary(null);
                                }
                            }}
                            className="absolute inset-0 opacity-0 cursor-pointer"
                        />
                        <Upload className="w-8 h-8 mx-auto text-zinc-600 mb-2" />
                        <p className="text-sm text-zinc-400">
                            {file ? file.name : 'Click to upload CSV'}
                        </p>
                        {file && (
                            <p className="text-xs text-zinc-500 mt-1">
                                {(file.size / 1024).toFixed(1)} KB
                            </p>
                        )}
                    </div>

                    <button
                        onClick={handleClassify}
                        disabled={!file || isClassifying}
                        className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:bg-zinc-700 disabled:cursor-not-allowed text-white py-3 rounded-lg font-medium flex items-center justify-center gap-2 transition"
                    >
                        {isClassifying ? (
                            <>
                                <Loader2 className="w-4 h-4 animate-spin" />
                                Classifying...
                            </>
                        ) : (
                            <>
                                <Sparkles className="w-4 h-4" />
                                Classify Prompts
                            </>
                        )}
                    </button>

                    {results.length > 0 && (
                        <button
                            onClick={handleDownload}
                            className="w-full bg-green-600 hover:bg-green-500 text-white py-3 rounded-lg font-medium flex items-center justify-center gap-2 transition"
                        >
                            <Download className="w-4 h-4" />
                            Download Classified CSV
                        </button>
                    )}

                    {error && (
                        <div className="p-3 bg-red-900/30 border border-red-800 rounded-lg text-sm text-red-300 flex items-start gap-2">
                            <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                            {error}
                        </div>
                    )}
                </div>

                {/* Group Legend */}
                <div className="mt-8">
                    <h3 className="text-sm font-medium text-zinc-400 mb-3">12-Group Taxonomy</h3>
                    <div className="space-y-1 text-xs">
                        {Object.entries(groupLabels).map(([group, info]) => (
                            <button
                                key={group}
                                onClick={() => setSelectedGroup(selectedGroup === Number(group) ? null : Number(group))}
                                className={clsx(
                                    "w-full flex items-center gap-2 p-2 rounded transition text-left",
                                    selectedGroup === Number(group)
                                        ? "bg-zinc-700 ring-1 ring-indigo-500"
                                        : "hover:bg-zinc-800/50"
                                )}
                            >
                                <span className={`w-3 h-3 rounded-full ${info.color}`} />
                                <span className="text-zinc-300 font-mono w-6">G{group}</span>
                                <span className="text-zinc-400 truncate">
                                    {info.chest} + {info.cape} + {info.arborist}
                                </span>
                                {summary?.group_counts && (
                                    <span className="ml-auto text-zinc-500">
                                        {summary.group_counts[Number(group)] || 0}
                                    </span>
                                )}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* Right Panel - Results */}
            <div className="flex-1 overflow-y-auto p-6 bg-background">
                {/* Summary Stats */}
                {summary && (
                    <div className="mb-6 grid grid-cols-4 gap-4">
                        <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-4 text-center">
                            <div className="text-2xl font-bold text-zinc-100">{summary.total}</div>
                            <div className="text-xs text-zinc-500">Total Prompts</div>
                        </div>
                        <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-4 text-center">
                            <div className="text-2xl font-bold text-green-400">{summary.valid}</div>
                            <div className="text-xs text-zinc-500">Valid</div>
                        </div>
                        <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-4 text-center">
                            <div className="text-2xl font-bold text-red-400">{summary.invalid}</div>
                            <div className="text-xs text-zinc-500">Invalid/Ambiguous</div>
                        </div>
                        <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-4 text-center">
                            <div className="text-2xl font-bold text-indigo-400">12</div>
                            <div className="text-xs text-zinc-500">Groups</div>
                        </div>
                    </div>
                )}

                {/* Filter Info */}
                {selectedGroup !== null && (
                    <div className="mb-4 flex items-center gap-2">
                        <span className="text-sm text-zinc-400">
                            Showing Group {selectedGroup}: {groupLabels[selectedGroup]?.chest} + {groupLabels[selectedGroup]?.cape} + {groupLabels[selectedGroup]?.arborist}
                        </span>
                        <button
                            onClick={() => setSelectedGroup(null)}
                            className="text-xs text-indigo-400 hover:text-indigo-300"
                        >
                            Show All
                        </button>
                    </div>
                )}

                {/* Results Table */}
                {filteredResults.length > 0 ? (
                    <div className="bg-zinc-900/30 border border-zinc-800 rounded-lg overflow-hidden">
                        <table className="w-full text-sm">
                            <thead className="bg-zinc-800/50">
                                <tr>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-zinc-400 uppercase tracking-wider w-16">Group</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-zinc-400 uppercase tracking-wider w-20">Number</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-zinc-400 uppercase tracking-wider w-48">Variants</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-zinc-400 uppercase tracking-wider">Prompt</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-zinc-400 uppercase tracking-wider w-16">Valid</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-zinc-800">
                                {filteredResults.slice(0, 100).map((item, idx) => (
                                    <tr key={idx} className={clsx(
                                        "hover:bg-zinc-800/30 transition",
                                        !item.is_valid && "bg-red-900/10"
                                    )}>
                                        <td className="px-4 py-3">
                                            <span className={clsx(
                                                "inline-flex items-center justify-center w-8 h-8 rounded-full text-xs font-bold text-white",
                                                groupLabels[item.group]?.color || 'bg-zinc-600'
                                            )}>
                                                {item.group}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 font-mono text-zinc-300">{item.number}</td>
                                        <td className="px-4 py-3 text-zinc-400 text-xs">{item.variants}</td>
                                        <td className="px-4 py-3 text-zinc-300 max-w-lg truncate" title={item.prompt}>
                                            {item.prompt.length > 100 ? item.prompt.slice(0, 100) + '...' : item.prompt}
                                        </td>
                                        <td className="px-4 py-3">
                                            {item.is_valid ? (
                                                <Check className="w-4 h-4 text-green-400" />
                                            ) : (
                                                <div className="group relative">
                                                    <AlertCircle className="w-4 h-4 text-red-400 cursor-help" />
                                                    <div className="absolute z-50 left-0 bottom-full mb-2 w-64 p-2 bg-zinc-800 border border-zinc-700 rounded text-xs text-red-300 opacity-0 group-hover:opacity-100 transition pointer-events-none">
                                                        {item.validation_notes}
                                                    </div>
                                                </div>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        {filteredResults.length > 100 && (
                            <div className="p-4 text-center text-sm text-zinc-500 border-t border-zinc-800">
                                Showing 100 of {filteredResults.length} results. Download CSV for complete data.
                            </div>
                        )}
                    </div>
                ) : !isClassifying && (
                    <div className="flex flex-col items-center justify-center h-64 text-zinc-500">
                        <FileSpreadsheet className="w-12 h-12 mb-4 opacity-30" />
                        <p>Upload a CSV and click "Classify Prompts" to begin</p>
                    </div>
                )}
            </div>
        </div>
    );
}
