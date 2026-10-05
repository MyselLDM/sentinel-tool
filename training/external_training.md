Based on the provided notebook files and result images, here is the training configuration and tabulated results for both models.

Training Configuration

Component Model A (NLI Cross-Encoder) Model B (Contrastive Bi-Encoder)
Model cross-encoder/nli-MiniLM2-L6-H768 all-MiniLM-L12-v2
Task 3-class NLI classification Contrastive learning (Triplet Loss)
Loss Cross-Entropy TripletLoss
Epochs 4 4
Batch Size 16 16
Learning Rate 3e-5 (from notebook thesis-nli-training.ipynb) 9e-7 (from notebook thesis-nli-contrastive-training.ipynb)
Weight Decay 0.02 0.4
Warmup Steps 0.1 (ratio) 0.1 (ratio)
Training Samples 622 7848 (triplets)

---

Model Comparison Results (cue_split test)

This table combines the results from the "NLI VS CONTRASTIVE METRICS COMPARISON" shown in both images. The values are from the second image, which appears to be the final run.

Metric NLI (Cross-Encoder) Contrastive (Bi-Encoder) Δ (Contr - NLI)
Accuracy 0.8929 0.9524 +0.0595
Macro F1 0.5822 0.9443 +0.3621
Binary AUC (Mal) 0.9590 0.9924 +0.0333
Mal TPR 0.9000 0.9333 +0.0333
Mal FPR 0.1250 0.0000 -0.1250
