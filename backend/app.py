import gradio as gr
from app.main import app as fastapi_app

# Mount Gradio helper UI at /status and serve full FastAPI app at root /
app = gr.mount_gradio_app(fastapi_app, gr.Interface(fn=lambda: "Apparatus AI Nutrition Backend Running!", inputs=[], outputs="text"), path="/status")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app:app", host="0.0.0.0", port=7860)
