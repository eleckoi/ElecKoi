---
library_name: transformers
license: apache-2.0
tags:
- jamba
- mamba
- moe
---

This is the base version of the Jamba model. We’ve since released a better, instruct-tuned version, [Jamba-1.5-Mini](https://huggingface.co/ai21labs/AI21-Jamba-1.5-Mini). For even greater performance, check out the scaled-up [Jamba-1.5-Large](https://huggingface.co/ai21labs/AI21-Jamba-1.5-Large).

# Model Card for Jamba

Jamba is a state-of-the-art, hybrid SSM-Transformer LLM. It delivers throughput gains over traditional Transformer-based models, while outperforming or matching the leading models of its size class on most common benchmarks.

Jamba is the first production-scale Mamba implementation, which opens up interesting research and application opportunities. While this initial experimentation shows encouraging gains, we expect these to be further enhanced with future optimizations and explorations.

This model card is for the base version of Jamba. It’s a pretrained, mixture-of-experts (MoE) generative text model, with 12B active parameters and a total of 52B parameters across all experts. It supports a 256K context length, and can fit up to 140K tokens on a single 80GB GPU.

For full details of this model please read the [white paper](https://arxiv.org/abs/2403.19887) and the [release blog post](https://www.ai21.com/blog/announcing-jamba).

## Model Details

- **Developed by:** [AI21](https://www.ai21.com)
- **Model type:** Joint Attention and Mamba (Jamba)
- **License:** Apache 2.0
- **Context length:** 256K
- **Knowledge cutoff date:** March 5, 2024

## Usage
### Presequities
In order to use Jamba, it is recommended you use `transformers` version 4.40.0 or higher (version 4.39.0 or higher is required):
```bash
pip install transformers>=4.40.0
```

In order to run optimized Mamba implementations, you first need to install `mamba-ssm` and `causal-conv1d`:
```bash
pip install mamba-ssm causal-conv1d>=1.2.0
```
You also have to have the model on a CUDA device.

You can run the model not using the optimized Mamba kernels, but it is **not** recommended as it will result in significantly lower latencies. In order to do that, you'll need to specify `use_mamba_kernels=False` when loading the model.

### Run the model
```python
from transformers import AutoModelForCausalLM, AutoTokenizer

model = AutoModelForCausalLM.from_pretrained("ai21labs/Jamba-v0.1")
tokenizer = AutoTokenizer.from_pretrained("ai21labs/Jamba-v0.1")

input_ids = tokenizer("In the recent Super Bowl LVIII,", return_tensors='pt').to(model.device)["input_ids"]

outputs = model.generate(input_ids, max_new_tokens=216)

print(tokenizer.batch_decode(outputs))
# ["<|startoftext|>In the recent Super Bowl LVIII, the Kansas City Chiefs emerged victorious, defeating the San Francisco 49ers in a thrilling overtime showdown. The game was a nail-biter, with both teams showcasing their skills and determination.\n\nThe Chiefs, led by their star quarterback Patrick Mahomes, displayed their offensive prowess, while the 49ers, led by their strong defense, put up a tough fight. The game went into overtime, with the Chiefs ultimately securing the win with a touchdown.\n\nThe victory marked the Chiefs' second Super Bowl win in four years, solidifying their status as one of the top teams in the NFL. The game was a testament to the skill and talent of both teams, and a thrilling end to the NFL season.\n\nThe Super Bowl is not just about the game itself, but also about the halftime show and the commercials. This year's halftime show featured a star-studded lineup, including Usher, Alicia Keys, and Lil Jon. The show was a spectacle of music and dance, with the performers delivering an energetic and entertaining performance.\n"]
```

Please note that if you're using `transformers<4.40.0`, `trust_remote_code=True` is required for running the new Jamba architecture.

<details>
<summary><strong>Loading the model in half precision</strong></summary>
  
  The published checkpoint is saved in BF16. In order to load it into RAM in BF16/FP16, you need to specify `torch_dtype`:
  
```python
from transformers import AutoModelForCausalLM
import torch
model = AutoModelForCausalLM.from_pretrained("ai21labs/Jamba-v0.1",
                                             torch_dtype=torch.bfloat16)    # you can also use torch_dtype=torch.float16
```

When using half precision, you can enable the [FlashAttention2](https://github.com/Dao-AILab/flash-attention) implementation of the Attention blocks. In order to use it, you also need the model on a CUDA device. Since in this precision the model is to big to fit on a single 80GB GPU, you'll also need to parallelize it using [accelerate](https://huggingface.co/docs/accelerate/index):
```python
from transformers import AutoModelForCausalLM
import torch
model = AutoModelForCausalLM.from_pretrained("ai21labs/Jamba-v0.1",
                                             torch_dtype=torch.bfloat16,
                                             attn_implementation="flash_attention_2",
                                             device_map="auto")
```

</details>
<details><summary><strong>Load the model in 8-bit</strong></summary>
  
  **Using 8-bit precision, it is possible to fit up to 140K sequence lengths on a single 80GB GPU.** You can easily quantize the model to 8-bit using [bitsandbytes](https://huggingface.co/docs/bitsandbytes/index). In order to not degrade model quality, we recommend to exclude the Mamba blocks from the quantization:

```python
from transformers import AutoModelForCausalLM, BitsAndBytesConfig
quantization_config = BitsAndBytesConfig(load_in_8bit=True,
                                         llm_int8_skip_modules=["mamba"])
model = AutoModelForCausalLM.from_pretrained("ai21labs/Jamba-v0.1",
                                             torch_dtype=torch.bfloat16,
                                             attn_implementation="flash_attention_2",
                                             quantization_config=quantization_config)
```
</details>

### Fine-tuning example
Jamba is a base model that can be fine-tuned for custom solutions (including for chat/instruct versions). You can fine-tune it using any technique of your choice. Here is an example of fine-tuning with the [PEFT](https://huggingface.co/docs/peft/index) library (requires ~120GB GPU RAM, in example 2xA100 80GB):

```python
import torch
from datasets import load_dataset
from trl import SFTTrainer, SFTConfig
from peft import LoraConfig
from transformers import AutoTokenizer, AutoModelForCausalLM, TrainingArguments

tokenizer = AutoTokenizer.from_pretrained("ai21labs/Jamba-v0.1")
model = AutoModelForCausalLM.from_pretrained(
    "ai21labs/Jamba-v0.1", device_map='auto', torch_dtype=torch.bfloat16)

lora_config = LoraConfig(
    r=8,
    target_modules=[
        "embed_tokens", 
        "x_proj", "in_proj", "out_proj", # mamba
        "gate_proj", "up_proj", "down_proj", # mlp
        "q_proj", "k_proj", "v_proj" # attention
    ],
    task_type="CAUSAL_LM",
    bias="none"
)

dataset = load_dataset("Abirate/english_quotes", split="train")
training_args = SFTConfig(
    output_dir="./results",
    num_train_epochs=2,
    per_device_train_batch_size=4,
    logging_dir='./logs',
    logging_steps=10,
    learning_rate=1e-5,
    dataset_text_field="quote",
)
trainer = SFTTrainer(
    model=model,
    tokenizer=tokenizer,
    args=training_args,
    peft_config=lora_config,
    train_dataset=dataset,
)
trainer.train()
```

## Results on common benchmarks
| Benchmark    | Score |
|--------------|:-----:|
| HellaSwag    | 87.1% |
| Arc Challenge | 64.4% |
| WinoGrande   | 82.5% |
| PIQA        | 83.2% |
| MMLU       | 67.4% |
| BBH            | 45.4% |
| TruthfulQA          | 46.4% |
| GSM8K (CoT)            | 59.9% |

It's crucial that the 'BOS' token is added to all prompts, which might not be enabled by default in all eval frameworks.


## Notice
Jamba is a pretrained base model and did not undergo any alignment for instruct/chat interactions. 

As a base model, Jamba is intended for use as a foundation layer for fine tuning, training, and developing custom solutions. Jamba does not have safety moderation mechanisms and guardrails should be added for responsible and safe use.

## About AI21
AI21 builds reliable, practical, and scalable AI solutions for the enterprise.

Jamba is the first in AI21’s new family of models, and the Instruct version of Jamba is coming soon to the [AI21 platform](https://www.ai21.com/studio). 
