import asyncio
import uuid
from typing import Dict, Any, Optional
from enum import Enum
from datetime import datetime

class JobStatus(str, Enum):
    QUEUED = "queued"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"

class Job:
    def __init__(self, job_type: str, payload: Dict[str, Any]):
        self.id = str(uuid.uuid4())
        self.type = job_type
        self.payload = payload
        self.status = JobStatus.QUEUED
        self.result = None
        self.error = None
        self.created_at = datetime.now()
        self.updated_at = datetime.now()

class QueueManager:
    def __init__(self, concurrency: int = 5):
        self.queue = asyncio.Queue()
        self.jobs: Dict[str, Job] = {}
        self.concurrency = concurrency
        self.workers = []
        self.running = False
        self._semaphore = asyncio.Semaphore(concurrency)

    async def start(self):
        self.running = True
        # Start workers
        for i in range(self.concurrency):
            worker = asyncio.create_task(self._worker(f"worker-{i}"))
            self.workers.append(worker)
        print(f"Started {self.concurrency} workers")

    async def stop(self):
        self.running = False
        for _ in self.workers:
            await self.queue.put(None) # Signal shutdown
        await asyncio.gather(*self.workers)

    async def submit_job(self, job_type: str, payload: Dict[str, Any]) -> str:
        job = Job(job_type, payload)
        self.jobs[job.id] = job
        await self.queue.put(job.id)
        return job.id

    def get_job(self, job_id: str) -> Optional[Job]:
        return self.jobs.get(job_id)

    def list_jobs(self):
        return list(self.jobs.values())

    async def _worker(self, name: str):
        while self.running:
            try:
                job_id = await self.queue.get()
                if job_id is None:
                    break
                
                job = self.jobs.get(job_id)
                if not job:
                    self.queue.task_done()
                    continue

                job.status = JobStatus.PROCESSING
                job.updated_at = datetime.now()
                
                try:
                    # Execute actual logic here based on job.type
                    # In a real app, this would dispatch to a handler
                    # For now, we simulate or call a global handler registry
                    if self.handler_callback:
                        result = await self.handler_callback(job)
                        job.result = result
                        job.status = JobStatus.COMPLETED
                    else:
                        raise Exception("No handler configured")

                except Exception as e:
                    print(f"Job {job_id} failed: {e}")
                    job.error = str(e)
                    job.status = JobStatus.FAILED
                
                job.updated_at = datetime.now()
                self.queue.task_done()
            except Exception as e:
                print(f"Worker {name} error: {e}")

    # Callback injection for simplicity in this monolithic structure
    handler_callback = None

queue_manager = QueueManager(concurrency=10)

# We need to register the handler in main.py or similar
