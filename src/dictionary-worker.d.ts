declare module 'dictionary.worker' {
	const WorkerFactory: new () => Worker;
	export default WorkerFactory;
}
