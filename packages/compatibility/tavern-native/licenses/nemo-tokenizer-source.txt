---
library_name: vllm
license: apache-2.0
language:
- en
- fr
- de
- es
- it
- pt
- ru
- zh
- ja
extra_gated_description: >-
  If you want to learn more about how we process your personal data, please read
  our <a href="https://mistral.ai/terms/">Privacy Policy</a>.
inference: false
tags:
- mistral-common
---

# Model Card for Mistral-Nemo-Base-2407

The Mistral-Nemo-Base-2407 Large Language Model (LLM) is a pretrained generative text model of 12B parameters trained jointly by Mistral AI and NVIDIA, it significantly outperforms existing models smaller or similar in size.

For more details about this model please refer to our release [blog post](https://mistral.ai/news/mistral-nemo/).

## Key features
- Released under the **Apache 2 License**
- Pre-trained and instructed versions
- Trained with a **128k context window**
- Trained on a large proportion of **multilingual and code data**
- Drop-in replacement of Mistral 7B

## Model Architecture
Mistral Nemo is a transformer model, with the following architecture choices:
- **Layers:** 40
- **Dim:** 5,120
- **Head dim:** 128
- **Hidden dim:** 14,436
- **Activation Function:** SwiGLU
- **Number of heads:** 32
- **Number of kv-heads:** 8 (GQA)
- **Vocabulary size:** 2**17 ~= 128k
- **Rotary embeddings (theta = 1M)**

## Metrics

### Main Benchmarks

| Benchmark | Score |
| --- | --- |
| HellaSwag (0-shot) | 83.5% |
| Winogrande (0-shot) | 76.8% |
| OpenBookQA (0-shot) | 60.6% |
| CommonSenseQA (0-shot) | 70.4% |
| TruthfulQA (0-shot) | 50.3% |
| MMLU (5-shot) | 68.0% |
| TriviaQA (5-shot) | 73.8% |
| NaturalQuestions (5-shot) | 31.2% |

### Multilingual Benchmarks (MMLU)

| Language | Score |
| --- | --- |
| French | 62.3% |
| German | 62.7% |
| Spanish | 64.6% |
| Italian | 61.3% |
| Portuguese | 63.3% |
| Russian | 59.2% |
| Chinese | 59.0% |
| Japanese | 59.0% |


## Usage

The model can be used with three different frameworks

- [`mistral_inference`](https://github.com/mistralai/mistral-inference): See [here](#mistral-inference)
- [`transformers`](https://github.com/huggingface/transformers): See [here](#transformers)
- [`NeMo`](https://github.com/NVIDIA/NeMo): See [nvidia/Mistral-NeMo-12B-Base](https://huggingface.co/nvidia/Mistral-NeMo-12B-Base)


### Mistral Inference


#### Install

It is recommended to use `mistralai/Mistral-Nemo-Base-2407` with [mistral-inference](https://github.com/mistralai/mistral-inference). 
For HF transformers code snippets, please keep scrolling.

```
pip install mistral_inference
```

#### Download

```py
from huggingface_hub import snapshot_download
from pathlib import Path

mistral_models_path = Path.home().joinpath('mistral_models', 'Nemo-v0.1')
mistral_models_path.mkdir(parents=True, exist_ok=True)

snapshot_download(repo_id="mistralai/Mistral-Nemo-Base-2407", allow_patterns=["params.json", "consolidated.safetensors", "tekken.json"], local_dir=mistral_models_path)
```

#### Demo

After installing `mistral_inference`, a `mistral-demo` CLI command should be available in your environment.

```
mistral-demo $HOME/mistral_models/Nemo-v0.1
```

### Transformers

> [!IMPORTANT]
> NOTE: Until a new release has been made, you need to install transformers from source:
> ```sh
> pip install git+https://github.com/huggingface/transformers.git
> ```

If you want to use Hugging Face `transformers` to generate text, you can do something like this.

```py
from transformers import AutoModelForCausalLM, AutoTokenizer

model_id = "mistralai/Mistral-Nemo-Base-2407"
tokenizer = AutoTokenizer.from_pretrained(model_id)

model = AutoModelForCausalLM.from_pretrained(model_id)
inputs = tokenizer("Hello my name is", return_tensors="pt")

outputs = model.generate(**inputs, max_new_tokens=20)
print(tokenizer.decode(outputs[0], skip_special_tokens=True))
```

> [!TIP]
> Unlike previous Mistral models, Mistral Nemo requires smaller temperatures. We recommend to use a temperature of 0.3.

## Note

`Mistral-Nemo-Base-2407` is a pretrained base model and therefore does not have any moderation mechanisms.

## The Mistral AI Team

Albert Jiang, Alexandre Sablayrolles, Alexis Tacnet, Alok Kothari, Antoine Roux, Arthur Mensch, Audrey Herblin-Stoop, Augustin Garreau, Austin Birky, Bam4d, Baptiste Bout, Baudouin de Monicault, Blanche Savary, Carole Rambaud, Caroline Feldman, Devendra Singh Chaplot, Diego de las Casas, Eleonore Arcelin, Emma Bou Hanna, Etienne Metzger, Gaspard Blanchet, Gianna Lengyel, Guillaume Bour, Guillaume Lample, Harizo Rajaona, Henri Roussez, Hichem Sattouf, Ian Mack, Jean-Malo Delignon, Jessica Chudnovsky, Justus Murke, Kartik Khandelwal, Lawrence Stewart, Louis Martin, Louis Ternon, Lucile Saulnier, Lélio Renard Lavaud, Margaret Jennings, Marie Pellat, Marie Torelli, Marie-Anne Lachaux, Marjorie Janiewicz, Mickaël Seznec, Nicolas Schuhl, Niklas Muhs, Olivier de Garrigues, Patrick von Platen, Paul Jacob, Pauline Buche, Pavan Kumar Reddy, Perry Savas, Pierre Stock, Romain Sauvestre, Sagar Vaze, Sandeep Subramanian, Saurabh Garg, Sophia Yang, Szymon Antoniak, Teven Le Scao, Thibault Schueller, Thibaut Lavril, Thomas Wang, Théophile Gervet, Timothée Lacroix, Valera Nemychnikova, Wendy Shang, William El Sayed, William Marshall