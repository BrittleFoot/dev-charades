function shuffle(a) {
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

class Storage {

    static init(name, email, tasks) {
        name = name.trim();
        email = Storage.canonize(email);
        return Storage.map(email, data => Object.assign(data || {}, {
            name: name || data.name,
            email,
            tasks,
            score: 0,
            answers: []
        }))
    }

    static save({email, score, answers}) {
        email = Storage.canonize(email);
        return Storage.map(email, data => Object.assign(data || {}, {
            email,
            score,
            answers
        }))
    }

    static get(email) {
        const data = Storage.select();
        return data[Storage.canonize(email)] || null;
    }

    static map(email, mapper) {
        email = Storage.canonize(email)

        let data = Storage.select();
        let mapped = mapper(data[email]);
        data[email] = mapped;
        Storage.unselect(data);
        return data[email];
    }

    static select() {
        const data = localStorage.getItem("devCharades")
        return data ? JSON.parse(data) : {};
    }

    static unselect(data) {
        localStorage.setItem("devCharades", JSON.stringify(data));
    }

    static canonize(key) {
        return (key || "").trim().toLowerCase();
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
        this.levels = levels
    }

    push(message, parameter) {
        this.dispatcher.push(message, parameter);
    }

    async run() {
        while (true) {
            this.level = shuffle(this.levels[this.config.level]);
            let user = await new RegistrationPage(this.dispatcher).run();

            let gamePage = new GamePage(
                this.dispatcher,
                user,
                this.config,
                this.level
            );

            let result = await gamePage.run()
            Storage.save(result);

            await new ResultPage(
                this.dispatcher,
                result,
                gamePage.startIndex,
                gamePage.prevScore
            ).run();
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
        this.dispatcher.attach("register", this.register.bind(this));
        this.page.classList.remove("invisible");
        return new Promise(resolve => this.resolver = resolve);
    }

    end(user) {
        this.dispatcher.deattach("register");
        this.page.classList.add("invisible");
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

        this.result = Storage.get(user.email);
        if (!this.result)
            this.result = Storage.init(user.name, user.email, tasks);
        else
            this.prevScore = this.result.score

        this.rounds = [...this.result.tasks];
        this.rounds.forEach(task => task.matcher = FuzzySet(task.rightAnswer));
        this.currentRoundIndex = this.result.answers.length;
        this.startIndex = this.currentRoundIndex;

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
        userInput = userInput.trim();

        this.dispatcher.deattach("answer");
        this.dispatcher.deattach("replay");

        const round = this.rounds[this.currentRoundIndex];
        const isRight = this.resolveMatch(round.matcher.get(userInput));

        this.result.answers.push({
            userInput: userInput ? userInput : "Нет ответа",
            isRight: isRight
        });

        const score = isRight ? round.factor : 0;
        this.nextRound(score);
        //isRight ? this.nextRound(round.factor) : this.end();
    }

    resolveMatch(match) {
        if (!match)
            return false;

        for (let [score, value] of match) {
            if (score >= config.errorSensitivity) {
                return true;
            }
        }
        return false;
    }

    replay(movie) {
        movie.play();
    }

    renderRound(number) {
        this.clearTask();
        this.userInput.value = "";
        this.userInput.focus();
        let movie = this.createTaskTag(this.rounds[number]);
        if (movie)
            this.taskContainer.appendChild(movie);

        this.dispatcher.attach("answer", this.answer.bind(this));
        this.dispatcher.attach("replay", this.replay.bind(this));

        if (this.currentRoundIndex === this.rounds.length) {
            return this.end();
        }
    }

    nextRound(factor) {
        this.result.score += factor;
        this.currentRoundIndex++;
        this.userInput.value = "";

        // Сохранение после каждого ответа. Закомментируй, если влияет на производительность
        Storage.save(this.result);

        this.renderRound(this.currentRoundIndex);
    }

    createTaskTag(task) {
        if (task && task.src) {
            const movie = document.createElement("video");
            movie.src = task.src;
            movie.width = 640;
            movie.height = 360;
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
        let promise = new Promise(resolve => this.resolver = resolve)
        this.initializeView();
        this.renderRound(this.currentRoundIndex);
        this.timer.start();

        this.dispatcher.attach("end", this.end.bind(this));
        return promise;
    }

    end() {
        this.dispatcher.deattach("answer");
        this.dispatcher.deattach("replay");
        this.dispatcher.deattach("end");

        this.timer.stop();
        this.clearTask();
        this.page.classList.add("invisible");
        this.resolver(this.result);
    }
}

class ResultPage {
    constructor(dispatcher, result, startIndex, prevScore) {
        this.resolver = null;
        this.startIndex = startIndex;
        this.prevScore = prevScore;
        this.dispatcher = dispatcher;
        this.result = result;
        this.page = document.querySelector(".gameover");
        this.scoreContainer = document.querySelector(".score");
        this.totalScoreContainer = document.querySelector(".total-score");
        this.totalScoreLine = document.querySelector(".total-score-container")
        this.scoreContainer = document.querySelector(".score");
        this.resultContainer = document.querySelector("#result");
    }

    createAnswerTag(item) {
        const answerItem = document.createElement("div");
        answerItem.className = item.isRight ? "isRight" : "isWrong"
        answerItem.textContent = item.userInput;

        if (answerItem.userInput === "Нет ответа" || item.isRight) {
            answerItem.classList.add("invisible")
        }

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

        let score = this.prevScore === undefined
            ? this.prevScore
            : this.result.score - this.prevScore;
        let totalScore = this.result.score;

        if (score === undefined) {
            this.scoreContainer.textContent = totalScore;
        } else {
            this.totalScoreLine.classList.remove("invisible");
            this.scoreContainer.textContent = score;
            this.totalScoreContainer.textContent = totalScore;
        }

        this.result.answers.slice(this.startIndex).map(item => {
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

const forms = document.querySelectorAll('form');

forms.forEach(form =>
    form.addEventListener('submit', prevent)
)

function prevent (e) {
    e.preventDefault();
}

const game = new Game(config, levels);
game.run();
