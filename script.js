function shuffle(a) {
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

class Storage {
    static save(name, email, score, answers) {
        const data = Storage.select();
        data[name] = {
            name,
            email,
            score,
            answers
        }

        localStorage.setItem("data", JSON.stringify(data));
    }

    static get(name) {
        const data = Storage.select();
        return data[name] || null;
    }

    static select() {
        const data = localStorage.getItem("data")
        return data ? JSON.parse(data) : {};
    }
}

class Dispatcher {
    constructor() {
        this.listeners = {};
    }

    attach(message, callback) {
        this.listeners[message] = callback;
    }

    deattach(message) {
        delete this.listeners[message];
    }

    push(message, parameter) {
        this.listeners[message](parameter);
    }
}

class Game {
    constructor(config, levels) {
        this.config = config;
        this.dispatcher = new Dispatcher();
    }

    push(message, parameter) {
        this.dispatcher.push(message, parameter);
    }

    async run() {
        while (true) {
            this.level = shuffle(levels[config.level]);
            const user = await new RegistrationPage(this.dispatcher).run();
            const result = await new GamePage(this.dispatcher, user, this.config, this.level).run();
            Storage.save(result.name, result.email, result.score, result.answers);
            await new ResultPage(this.dispatcher, result).run();
        }
    }
}

class Timer {
    constructor(time, lostCallback) {
        this.timer = document.querySelector(".timer");

        this.time = time;
        this.callback = lostCallback;
        this.interval = 0;
    }

    start() {
        clearInterval(this.interval);
        this.state = this.time;
        this.interval = setInterval(this.tick.bind(this), 1000);
    }

    stop() {
        clearInterval(this.interval);
    }

    tick() {
        this.state -= 1000;
        this.timer.textContent = this.state / 1000;
        if (this.state <= 0) {
            this.stop();
            this.callback();
        }
    }
}

class RegistrationPage {
    constructor(dispatcher) {
        this.dispatcher = dispatcher;
        this.resolver = null;
        this.page = document.querySelector(".registration");
        this.form = this.page.querySelector(".form");
    }

    run() {
        this.dispatcher.attach("register", this.register.bind(this))
        this.page.classList.remove("invisible");
        return new Promise(resolve => this.resolver = resolve);
    }

    end(user) {
        this.dispatcher.deattach("register");
        this.page.classList.add("invisible")
        this.form.reset();
        this.resolver(user);
    }

    register() {
        const data = new FormData(this.form);
        const user = {};
        for (let [key, value] of data.entries()) {
            user[key] = value;
        }

        if (user.name && user.email) {
            this.end(user);
        }
    }
}

class GamePage {
    constructor(dispatcher, user, config, tasks) {
        this.resolver = null;
        this.dispatcher = dispatcher;
        this.result = {
            name: user.name,
            email: user.email,
            score: 0,
            answers: []
        }
        this.rounds = [...tasks];
        this.currentRoundIndex = 0;

        this.page = document.querySelector(".game");
        this.taskContainer = document.querySelector(".task");
        this.movie = document.querySelector("#movie");
        this.userInput = document.querySelector("#userInput");
        this.timer = new Timer(config.time, this.end.bind(this));
    }

    initializeView() {
        this.page.classList.remove("invisible");
    }

    answer(userInput) {
        this.dispatcher.deattach("answer");
        this.dispatcher.deattach("replay");
        const round = this.rounds[this.currentRoundIndex];
        const isRight = round.rightAnswer === userInput;
        this.result.answers.push({ userInput: userInput, isRight: isRight });
        isRight ? this.nextRound(round.factor) : this.end();
    }

    replay(movie) {
        movie.play();
    }

    renderRound(number) {
        this.clearTask();
        this.userInput.value = "";
        this.taskContainer.appendChild(this.createTaskTag(this.rounds[number]));
        this.dispatcher.attach("answer", this.answer.bind(this));
        this.dispatcher.attach("replay", this.replay.bind(this));
    }

    nextRound(factor) {
        this.result.score += factor;
        this.currentRoundIndex++;
        this.userInput.value = "";
        if (this.currentRoundIndex === this.rounds.length) {
            return this.end();
        }
        this.renderRound(this.currentRoundIndex);
    }

    createTaskTag(task) {
        if (task.src) {
            const movie = document.createElement("video");
            movie.src = task.src;
            movie.width = 640;
            movie.height = 480;
            movie.autoplay = true;

            return movie;
        }
    }

    clearTask() {
        if (this.taskContainer.firstChild) {
            this.taskContainer.removeChild(this.taskContainer.firstChild);
        }
    }

    run() {
        this.initializeView();
        this.renderRound(0);
        this.timer.start();
        return new Promise(resolve => this.resolver = resolve);
    }

    end() {
        this.timer.stop();
        this.clearTask();
        this.page.classList.add("invisible");
        this.resolver(this.result);
    }
}

class ResultPage {
    constructor(dispatcher, result) {
        this.resolver = null;
        this.dispatcher = dispatcher;
        this.result = result;
        this.page = document.querySelector(".gameover");
        this.scoreContainer = document.querySelector(".score");
        this.resultContainer = document.querySelector("#result");
    }

    createAnswerTag(item) {
        const answerItem = document.createElement("div");
        answerItem.className = item.isRight ? "isRight" : "isWrong"
        answerItem.textContent = item.userInput;

        return answerItem;
    }

    clearAnswer() {
        while (this.resultContainer.firstChild) {
            this.resultContainer.removeChild(this.resultContainer.firstChild);
        }
    }

    run() {
        this.dispatcher.attach("end", this.end.bind(this));
        this.page.classList.remove("invisible");
        this.scoreContainer.textContent = this.result.score;
        this.result.answers.map(item => {
            this.resultContainer.appendChild(this.createAnswerTag(item));
        })
        return new Promise(resolve => this.resolver = resolve);
    }

    end() {
        this.clearAnswer();
        this.dispatcher.deattach("end");
        this.page.classList.add("invisible");
        this.resolver();
    }
}

const game = new Game(config, levels);
game.run();