export const seedArticles = [
  {
    id: "a1c4e8f2-7b91-4d33-9c0a-kalidass001",
    slug: "the-geometry-of-attention",
    title: "The Geometry of Attention",
    subtitle: "Transformers do not read. They angle. The rest of the stack is lighting.",
    excerpt:
      "Every useful model is a negotiation about what may be ignored. Attention is not a metaphor for focus. It is a map of permitted influence, drawn in high dimension and spent like voltage.",
    coverImage:
      "https://images.unsplash.com/photo-1620712943543-bcc4688e7485?auto=format&fit=crop&w=2000&q=80",
    videoUrl: "https://www.youtube.com/watch?v=wjZofJX0v4M",
    author: {
      name: "Ada Voss",
      role: "Research editor",
      avatar:
        "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=200&q=80",
    },
    tags: ["Transformers", "Research", "Systems"],
    accent: "#22d3ee",
    publishedAt: "2026-08-18T09:00:00.000Z",
    readTime: 9,
    featured: true,
    blocks: [
      {
        type: "paragraph",
        text: "A sequence model is not a reader. It is a routing fabric. Tokens arrive as coordinates; attention decides which coordinates are allowed to rewrite the others. The romance of 'understanding' is downstream of that permission structure.",
      },
      {
        type: "heading",
        text: "Influence is a budget",
      },
      {
        type: "paragraph",
        text: "Softmax is an accountant. It forces a distribution over context so that a layer cannot listen to everything equally. That constraint is the product. Remove it and you do not get omniscience. You get noise with better branding.",
      },
      {
        type: "image",
        url: "https://images.unsplash.com/photo-1677442136019-21780ecad995?auto=format&fit=crop&w=1600&q=80",
        caption: "Latent space is less a landscape than a set of legal turns.",
      },
      {
        type: "quote",
        text: "A model is interesting where it refuses. The rest is interpolation with a press release.",
        cite: "Ada Voss",
      },
      {
        type: "paragraph",
        text: "When labs ship long context, they are not buying memory. They are buying a larger graph of possible influence and hoping retrieval, sparsity, or caching will keep the bill from becoming the architecture.",
      },
      {
        type: "heading",
        text: "What to ship instead of awe",
      },
      {
        type: "paragraph",
        text: "If you are building on this stack, instrument the refusals. Log which spans actually moved the logits. Publish the cheap ablations. The geometry is already there; most products just never look at it.",
      },
      {
        type: "video",
        url: "https://www.youtube.com/watch?v=wjZofJX0v4M",
        caption: "A visual walk through attention as routing, not mysticism.",
      },
      {
        type: "paragraph",
        text: "Treat attention maps as product telemetry. Then the next model card can describe a machine instead of a mood.",
      },
    ],
  },
  {
    id: "b2d5f9a3-8c02-4e44-0d1b-kalidass002",
    slug: "agents-that-remember-too-much",
    title: "Agents That Remember Too Much",
    subtitle: "Persistent memory is not a feature until forgetting is designed.",
    excerpt:
      "Give an agent a scratchpad and it becomes useful. Give it a warehouse and it becomes a liability with a cheerful tone. Memory without eviction is just a slower way to hallucinate with citations.",
    coverImage:
      "https://images.unsplash.com/photo-1550751827-4bd374c3f58b?auto=format&fit=crop&w=2000&q=80",
    videoUrl: "https://www.youtube.com/watch?v=aircAruvnKk",
    author: {
      name: "Noor Hale",
      role: "Agent architect",
      avatar:
        "https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=200&q=80",
    },
    tags: ["Agents", "Memory", "Product"],
    accent: "#a78bfa",
    publishedAt: "2026-07-30T16:20:00.000Z",
    readTime: 8,
    featured: false,
    blocks: [
      {
        type: "paragraph",
        text: "The current agent stack is a file system wearing a personality. Tools write. Logs accumulate. Retrieval pretends that recency and relevance are the same variable. They are not.",
      },
      {
        type: "heading",
        text: "State is a product surface",
      },
      {
        type: "paragraph",
        text: "Users do not want an agent that 'knows them'. They want an agent that can reconstruct the last useful context and ignore the rest. That is search, summarization, and deletion — three products hiding under one anthropomorphic label.",
      },
      {
        type: "image",
        url: "https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=1600&q=80",
        caption: "Most memory bugs are storage bugs with a conversational UI.",
      },
      {
        type: "quote",
        text: "If you cannot explain what gets dropped, you do not have memory. You have residue.",
        cite: "Noor Hale",
      },
      {
        type: "video",
        url: "https://www.youtube.com/watch?v=aircAruvnKk",
        caption: "A reminder that representations are constructed, not collected.",
      },
      {
        type: "paragraph",
        text: "Ship an eviction policy before you ship a second tool. The agent that forgets on purpose is the one you can audit.",
      },
    ],
  },
  {
    id: "c3e6a0b4-9d13-4f55-1e2c-kalidass003",
    slug: "eval-is-a-product-decision",
    title: "Eval Is a Product Decision",
    subtitle: "Benchmarks are not neutral. They are taste, frozen into a spreadsheet.",
    excerpt:
      "A leaderboard looks like science from far away. Up close it is a product spec: which failures are expensive, which dialects count as correct, and which users you have already decided not to serve.",
    coverImage:
      "https://images.unsplash.com/photo-1517430816045-df4b7de11d1d?auto=format&fit=crop&w=2000&q=80",
    videoUrl: "",
    author: {
      name: "Priya Mendel",
      role: "Eval lead",
      avatar:
        "https://images.unsplash.com/photo-1580489944761-15a19d654956?auto=format&fit=crop&w=200&q=80",
    },
    tags: ["Evals", "Quality", "Labs"],
    accent: "#c4f542",
    publishedAt: "2026-06-21T11:00:00.000Z",
    readTime: 7,
    featured: false,
    blocks: [
      {
        type: "paragraph",
        text: "Teams argue about models when they are actually arguing about graders. Change the rubric and the 'better' system flips. That is not a scandal. That is the job.",
      },
      {
        type: "heading",
        text: "Gold is a dialect",
      },
      {
        type: "paragraph",
        text: "Human labels encode house style, legal appetite, and the patience of whoever annotated at 1 a.m. If your eval cannot name those biases, it will still enforce them. Quietly, every release.",
      },
      {
        type: "image",
        url: "https://images.unsplash.com/photo-1555949963-aa79dcee981c?auto=format&fit=crop&w=1600&q=80",
        caption: "A dashboard is an argument. Make the axes explicit.",
      },
      {
        type: "quote",
        text: "You do not find quality. You budget for which errors may survive.",
        cite: "Priya Mendel",
      },
      {
        type: "paragraph",
        text: "Publish the slice metrics that hurt. Offline eval is a rehearsal; online eval is the show. A lab that only reports the rehearsal is not being modest. It is being selective.",
      },
    ],
  },
  {
    id: "d4f7b1c5-0e24-4066-2f3d-kalidass004",
    slug: "multimodal-is-a-plumbing-problem",
    title: "Multimodal Is a Plumbing Problem",
    subtitle: "Pixels, waveforms, and tokens only become intelligence after the clocks agree.",
    excerpt:
      "The demo is always a video that understands a screenshot. The production system is timestamps, codecs, GPU queues, and a retrieval index that still thinks in sentences.",
    coverImage:
      "https://images.unsplash.com/photo-1485827404703-89b55fcc595e?auto=format&fit=crop&w=2000&q=80",
    videoUrl: "https://www.youtube.com/watch?v=0fKBhvDjuy0",
    author: {
      name: "Leo Okonkwo",
      role: "Systems engineer",
      avatar:
        "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=200&q=80",
    },
    tags: ["Multimodal", "Infra", "Video"],
    accent: "#fb7185",
    publishedAt: "2026-05-08T14:40:00.000Z",
    readTime: 6,
    featured: false,
    blocks: [
      {
        type: "paragraph",
        text: "A vision-language model is a diplomatic service between two badly compatible file formats. Images arrive dense and silent. Language arrives sparse and opinionated. Your job is the embassy.",
      },
      {
        type: "image",
        url: "https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?auto=format&fit=crop&w=1600&q=80",
        caption: "Alignment is less poetry than packet timing.",
      },
      {
        type: "heading",
        text: "Store the evidence, not the vibe",
      },
      {
        type: "paragraph",
        text: "If the article has a still and a moving picture, those objects should live in real object storage with durable URLs. The model can caption later. The archive cannot be a GPU's working memory.",
      },
      {
        type: "video",
        url: "https://www.youtube.com/watch?v=0fKBhvDjuy0",
        caption: "Distance as a rendering problem: the same lesson as context windows.",
      },
      {
        type: "paragraph",
        text: "Put media in a bucket. Put metadata in a worker. Let the journal stay a journal. Intelligence can visit; it should not be the filesystem.",
      },
    ],
  },
];
